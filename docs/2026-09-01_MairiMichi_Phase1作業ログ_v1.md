# MairiMichi Phase 1 作業ログ

- 作成日: 2026-09-01
- 状態: **`npm test` 215件 緑 / `npm run typecheck` クリーン / `next build` 成功 / `npm audit` 0件**（§7 で依存を更新済み）
- 前提: デスクトップとのリンクが切れていたため、クラウド側で構築して tar.gz で受け渡し

---

## 0. できたこと（結論）

**コア層・ETL・UI の3層が揃い、設計上の約束がテストで固定された状態。** データ投入（ダンプ取得）を残すのみ。

| 層 | 状態 |
|---|---|
| コア（型・導出・判定） | ✅ 完成。215テスト |
| マスタ（data/*.yaml） | ✅ 完成。**エラー0件**で相互検証を通過 |
| ETL 実行スクリプト | ✅ 完成。ダンプさえあれば回る |
| UI | ✅ 3状態を実HTMLで確認済み |
| データ投入 | ⏸ ネットワークからの大容量取得が必要 |

---

## 1. 追加したもの

### 1.1 マスタのローダと相互検証（`src/data/loaders.ts`）

**なぜ要るか**: `cluster_benefits.yaml` が `benefits.yaml` に無い御利益IDを指していても、`deriveBenefits()` は `majorOf` の解決に失敗して**黙ってその1件を捨てる**。つまり「稲荷神なのに商売繁盛が付かない」が、エラーも警告も無く起きる。**YAMLのタイプミス1文字で導出が静かに壊る。**

検証する内容:

| 種別 | 内容 |
|---|---|
| error | 存在しない御利益ID / 存在しないクラスタ / ID重複 / 大分類の欠落 |
| error | primary と secondary に同じIDがある |
| error | `source_type: official` なのに `source_url` が無い（作法） |
| warning | primary が3つ以上（1寺社10タグ問題の再発） |
| warning | primary が空（検索に一切出ない） |
| warning | 別名の衝突（どちらのクラスタに寄るかが定義順依存になる） |
| warning | 番号付き巡礼に `total_count` が無い（収録率を管理できない） |
| warning | `kind: sandai` なのに `disputed` が無い |
| warning | 作法が `PENDING_VERIFICATION` のまま |

**実マスタの検証結果: エラー0件 / 警告4件**（4件はいずれも作法の一次情報が未了。想定どおり）

```
$ npm run etl:validate
マスタデータの検証: エラー 0 件 / 警告 4 件
  大分類 10 / 細分類 34 / 神格クラスタ 40 / 御利益の割り当て 40
  作法の例外 4 / 宗派ルール 2 / 巡礼グループ 9
■ 意図的に御利益を出さないクラスタ
  jinbutsu_shin: 定型マッピングなし（人物神など）
  miroku / amida / shaka: 現世利益に落ちない
```

### 1.2 ETL 実行スクリプト

| コマンド | 内容 |
|---|---|
| `npm run etl:validate` | マスタ検証。**エラーがあれば exit 1**（CIに入れる） |
| `npm run etl:extract` | zh.wikisource ダンプから古典本文を抽出 |
| `npm run etl:shikinai` | 延喜式神名帳をパースして構造化 |
| `npm run etl:priority` | 正月比による収録優先度を計算 |
| `npm run etl:gaps` | 穴を検出して Markdown 出力 |

**設計上の判断**

- **bz2 の展開は `bzcat` に任せる**（Node に bzip2 が無い）。数GBのダンプを丸ごとメモリに載せず、`<page>` に入ったときだけバッファし、対象外なら即捨てるストリーム走査
- **pageview ダンプの列数が想定と違えば例外を投げる**。黙って誤パースするより落ちるほうがよい
- **REST API は 6秒間隔＋指数バックオフ（15s→45s→135s）**。連絡先を含む固有 User-Agent が必須
- **404（記事なし）と views 0 を区別する**

### 1.3 UI

| ファイル | 内容 |
|---|---|
| `app/page.tsx` | 願い（大分類10）から探す入口 |
| `app/benefits/[major]/page.tsx` | 一覧。**車なしで行ける / 判定不能も含める / 関連するご利益も含める** の3フィルタ |
| `app/sites/[id]/page.tsx` | 詳細 |
| `components/AccessBadge.tsx` | アクセス難易度。**アイコン＋文言**（色のみに依存しない） |
| `components/BenefitList.tsx` | 御利益＋**導出根拠**＋確度バッジ |
| `components/CitationPanel.tsx` | 典拠。**層ラベル**（一次史料／読み下し／近代の記録／編集部） |
| `components/EtiquettePanel.tsx` | 参拝作法・御朱印 |
| `components/SiteMap.tsx` | Leaflet + 地理院タイル（標準＋**陰影起伏**） |
| `components/Attribution.tsx` | 全データ源の帰属表示（全ページ固定） |
| `lib/map-links.ts` | Google マップ URLスキーム（**めぐりコース用の waypoints 対応済み**） |

---

## 2. 実装中に見つけた不具合（すべて修正済み）

| # | 症状 | 原因 | 修正 |
|---|---|---|---|
| 1 | 社名が途中で切れる | 割注の中にも `／` が出る（`乙訓坐大雷神社／名神大。月／次新甞。∥`） | **最初の `／` だけを区切りにする** |
| 2 | `金山毘古命` と `金山彦命` が一致しない | `毘古→彦` を1文字ずつ置換して `金山彦彦` になっていた | **複数文字の綴りを先に寄せる** |
| 3 | 「小社**社**として」と重複 | `RANK_LABEL` が既に「小社」で終わるのに `社として` を足していた | 文を2つに分けた |
| 4 | 単一データ点でスコアが0 | `normalize` が `max<=min` で常に0を返した | 幅が無いときは値を持つこと自体を1とする |
| 5 | `next build` が失敗 | Next の webpack が `.js` 拡張子付き相対importを解決できない | src/tests 全体から `.js` を除去 |
| 6 | layout.tsx でビルドエラー | Next は layout から任意のexportを許さない | `Attribution` を components へ切り出し |
| 7 | プリレンダで例外 | `'use client'` ファイル内の純関数をサーバから呼んでいた | `lib/map-links.ts` へ切り出し |

**1〜4 はテストが拾ったもの。5〜7 はビルドが拾ったもの。**

---

## 3. 実HTMLで確認した挙動

`next build` が生成した静的HTMLから抜粋（テキスト化）。

**サンプル①（電車のみ・御朱印あり・式内社）**
```
● ご利益 確認済み ○ 参拝作法 未確認 ● 御朱印 確認済み ● アクセス 確認済み ● 典拠 確認済み
商売繁盛 [祭神・本尊からの推定] 「商売繁盛」— 稲荷神をお祀りしているため（祭神・本尊にもとづく推定）。
🚃 電車のみ / 徒歩らく  徒歩12分 / 登り18m
二礼二拍手一礼  [一般的な作法] この社の個別の作法は確認できていません。
受付時間 09:00〜16:00 / 昼休み 12:00〜13:00 / 直書き・書き置きの両方 / 300円
※参拝時間と御朱印の受付時間は別です。御朱印のほうが早く終わることがあります。
2026-08-01 時点の情報
[一次史料] 延喜式 巻第九・山城國乙訓郡
  乙訓坐大雷神社／名神大。月／次新甞。∥
[編集部] 名神大社であり、月次祭・新嘗祭に預かる。国家的な祈年穀の対象だったことが、割注の記載だけから言えます。
出典: 延喜式（原文はパブリックドメイン）
当サイトは社寺に点数や順位を付けません。評価や写真は外部でご覧ください。
```

**サンプル②（GTFS未整備・人物神）**
```
○ ご利益 未確認
この社寺のご利益は、祭神・本尊からは特定できていません。文化財指定・札所・御朱印の情報をご覧ください。
祭神・本尊: 織田信長
❓ 判定不能 / 徒歩ふつう
この地域はバスの運行データが公開されていないため、車が必要かどうかを判定できていません。
バス停の位置は地図に表示しています。現地の時刻表をご確認ください。
周辺より約35m高い場所にあります。
```

**サンプル③（車必須・浄土真宗）**
```
🚗 車が必要 / 徒歩きつい  徒歩42分 / 登り210m
参道の登りがあります。歩きやすい靴をおすすめします。
合掌（拍手はしません）  山門で一礼し、本堂で静かに合掌します。拍手は打ちません。
御朱印の授与はありません
浄土真宗では原則として御朱印を授与していません。一部の寺院で「法語印」を授与している場合があります。
所属する巡り: 四国八十八箇所 第51番
```

**設計上の約束が実際の出力に出ていることを確認した。**

---

## 4. 次にやること

### 4.1 データ投入（ネットワークが要る。ローカルで実行）

```bash
cd app

# ① 古典の本文（原文はパブリックドメイン）
curl -O https://dumps.wikimedia.org/zhwikisource/latest/zhwikisource-latest-pages-articles.xml.bz2
bzcat zhwikisource-latest-pages-articles.xml.bz2 \
  | npm run etl:extract -- --out ../etl-cache/classical

# ② 延喜式神名帳を構造化（式内社2,861社）
npm run etl:shikinai -- \
  --in "../etl-cache/classical/延喜式_卷第九.txt,../etl-cache/classical/延喜式_卷第十.txt" \
  --out ../etl-cache/shikinai.json
```

**★②の実行後、必ず `unparsed` を目視すること。** 国・郡の見出し形式は実本文の全パターンを確認できていない。ここに大量に落ちていたら正規表現の調整が要る。パース社数が記載（2,861処）と50以上ずれたら警告を出すようにしてある。

```bash
# ③ 収録優先度（正月比）— 対象記事のリストを作ってから
for m in 202601 202603 202604 202606 202607; do
  y=${m:0:4}; mo=${m:4:2}
  curl -O "https://dumps.wikimedia.org/other/pageview_complete/monthly/$y/$y-$mo/pageviews-$m-user.bz2"
done
npm run etl:priority -- --titles ../data/phase1_titles.txt \
  --dumps "pageviews-202601-user.bz2:2026:1,pageviews-202603-user.bz2:2026:3,pageviews-202604-user.bz2:2026:4,pageviews-202606-user.bz2:2026:6,pageviews-202607-user.bz2:2026:7" \
  --out ../etl-cache/priority.json
```

**★③の初回は `parsePageviewLine` の列数チェックで落ちる可能性がある。** ダンプの形式は公式ドキュメント記載のものに従っているが、実ダンプでの検証ができていない。落ちたら行を目視してパーサを直すこと（黙って誤パースするより落ちる設計にしてある）。

### 4.2 まだ書いていないもの

| # | 内容 | 備考 |
|---|---|---|
| 1 | `data/phase1_titles.txt` | 収録候補の記事名リスト。**正月比を測る対象** |
| 2 | OSM PBF → 社寺抽出（`etl/01_fetch_osm.ts`） | Geofabrik japan-latest.osm.pbf 2.3GB |
| 3 | Wikidata SPARQL（`etl/02_fetch_wikidata.ts`） | **QLever ミラー推奨**（本家より速い） |
| 4 | ja.Wikipedia ダンプ→infobox（`etl/03_fetch_jawp.ts`） | 抽出関数は実装済み。ダンプ走査部だけ |
| 5 | 交通・標高（`etl/07`, `etl/08`） | 判定ロジックは実装済み。データ結合部だけ |
| 6 | D1 への流し込み（`etl/09_emit.ts`） | スキーマは `db/schema.sql` にある |
| 7 | 参拝記録（IndexedDB） | F-12 |

### 4.3 早めに動いたほうがよいこと

**國學院大學デジタルミュージアムへの利用フォーム提出。** 式内社DB（2,861社の論社比定・緯度経度）と神道・神社史料集成（約450社の神階）には **API も一括DL も無い**。商用利用の意図を明示して問い合わせる必要があり、ここが Phase 1 のクリティカルパスになりうる。

---

## 5. 未確認のまま残していること

1. **pageview ダンプの実際の列レイアウト** — 公式ドキュメント記載の形式で実装したが実ダンプ未検証。列数チェックで落とすようにしてある
2. **神名帳の国・郡の見出し形式の全パターン** — サンプルで確認した形式のみ対応。`unparsed` を目視して調整する
3. **`data/etiquette_overrides.yaml` の四拍手4件** — 全件 `PENDING_VERIFICATION`。公式サイトでの裏取りが済むまで四拍手は表示されない（既定の二拍手が出る）
4. **アクセス判定の閾値** — 徒歩上限・便数閾値・登り標高はすべて仮値。**Phase 1f の実地検証で調整する**
5. **`nearbyPopulation` の仮説** — 「氏神は氏子の数だけ参拝される」は未検証。Phase 1 で効果測定する
6. **Workers 上でのマスタ読み込み** — 現在は `node:fs` で YAML を読んでいる。Workers には node:fs が無いので、`etl/09_emit.ts` が生成する JSON を読む形に差し替える必要がある

---

## 6. 検証コマンド

```bash
cd app
npm install
npm test          # 215 tests
npm run typecheck # クリーン
npm run build     # 静的16ページ生成（/benefits/[major] は動的。§7.3）
npm run etl:validate
```

---

## 7. 追記（2026-09-01 夜）依存の更新と警告の解消

ローカルでの検証時に出た2点に対処した。

### 7.1 `npm audit` の 7件 → 0件

| 深刻度 | パッケージ | 実際に必要な条件 | 配信バンドルへの影響 |
|---|---|---|---|
| critical | vitest | **`vitest --ui` を起動して待ち受けている時のみ**任意ファイル読み取り・実行 | なし（devDependency） |
| high | vite / esbuild | 開発サーバのパストラバーサル | なし（devDependency） |
| high + moderate×4 | postcss（next経由） | 攻撃者が用意したCSSを処理した場合 | ビルド時のみ。自前CSSしか通さない |

**7件すべて開発・ビルド用の依存で、実際に配信されるバンドルには入っていなかった。**
とはいえ上げれば消えるので更新した。

| パッケージ | 変更 | 結果 |
|---|---|---|
| vitest | `^2.0.5` → `^4.1.11` | 設定変更なしで 215 tests そのまま緑。critical 1件 + high 1件が解消 |
| next | `^15.1.3` → `^16.3.4` | 残る high 1件 + moderate 4件が解消 |
| wrangler | `^4.86.0` → `^4.125.0` | OpenNext の peer 要件を明示（実インストールは元から満たしていた） |

**Next 16 に上げてよいと判断した根拠**（推測せず実際に確認した）:

```
@opennextjs/cloudflare 1.20.5 の peerDependencies
  next     : ">=15.5.24 <16 || >=16.3.3"   実際 16.3.4  ✅
  wrangler : "^4.125.0"                     実際 4.127.1 ✅
```

**OpenNext が Next 16 に対応済み**だったのが決め手。対応していなければ Cloudflare へのデプロイが詰むので、上げずに据え置く判断だった。

検証結果: `npm test` 215件緑 / `tsc --noEmit` クリーン / `next build` 成功 / `npm audit` **found 0 vulnerabilities**。

### 7.2 ワークスペースルートの誤認警告

`~/package-lock.json` が存在すると Next がそちらをルートと誤認して警告を出していた。
`next.config.mjs` に `outputFileTracingRoot` を明示して固定した。

```js
outputFileTracingRoot: dirname(fileURLToPath(import.meta.url))
```

### 7.3 ★Next 16 で挙動が1つ変わった（把握しておくこと）

`/benefits/[major]` が **● SSG → ƒ Dynamic（リクエストごとにサーバ描画）** になった。

原因は、このページが `searchParams`（`carfree` / `unknown` / `related` のフィルタ）を読んでいるため。
**Next 15 はシェルを事前生成していたが、16 はより厳密になり動的扱いになった。16 のほうが正しい。**

**据え置く判断をした理由**:

- クエリパラメータで内容が変わるページなので、動的が本来の姿
- Cloudflare Workers + OpenNext では動的描画も安価。ページ自体が小さい
- **Phase 3 で3万件規模になったとき、サーバ側で絞るほうが素直**。全件をクライアントに送る設計にはしたくない

静的に戻したい場合は、フィルタをクライアントコンポーネントに移して `useSearchParams` で絞る形にする。
ただし全件をクライアントへ送ることになるので、件数が増えたときに破綻する。**今は動的のままでよい。**

なお Next 16 は `tsconfig.json` を自動で書き換えた（`jsx: preserve` → `react-jsx`、`.next/dev/types` を include に追加）。これは 16 では正しい設定なのでそのまま採用している。

---

## 8. ★App Router が認識されずビルドが `/404` だけになった件

### 8.1 症状

ローカルでの `npm run build` の出力が以下だけになった。

```
Route (pages)
─ ○ /404
```

`Route (app)` ではなく `Route (pages)`。全ページが消えている。
**ビルド自体は「成功」扱いで、エラーも警告も出ない。**

### 8.2 原因

`app/` 直下に**空の `app/` ディレクトリ**が存在していた。

```
app/
├── app/          ← 空。これが原因
└── src/app/      ← ページはすべてここにある（無傷）
```

**Next.js は App Router を `./app` と `./src/app` の両方で探し、`./app` があればそちらを優先する。**
空だとルート0件と判定され、pages router にフォールバックして自動生成の `/404` だけになる。

コンテナ側で空の `app/` を作って再現し、削除すると16ページに戻ることを確認した。

### 8.3 Next が作ったものではない

`app/` を削除してから `next build` を回しても再生成されなかった。
**Next.js は空の `app/` を作らない。** 何らかの操作で作られた迷子のディレクトリ。

### 8.4 対処

```bash
rmdir app        # app/ ディレクトリの中で実行（app/app を消す）
```

### 8.5 再発防止

`scripts/check-app-router.mjs` を追加し、`prebuild` / `predev` に配線した。

- `./app` と `./src/app` が両方ある → **エラーで停止**
- `./app` はあるが page/route/layout が1つも無い → エラーで停止
- どちらも無い → エラーで停止

```
✖ App Router の構成が壊れています

  App Router のディレクトリが2つあります:
    /path/app
    /path/src/app
  Next.js は ./app を優先するため、src/app のページは無視されます。

  対処: 中身のない ./app を削除してください
    rmdir app
```

**このクラスの障害は「ビルドは通るが中身が消える」ため気付きにくい。** 静かに壊れるものは落とす。

### 8.6 Node のバージョン

`npm install` 時に警告が出ていた。

```
npm warn EBADENGINE package: 'vitest@4.1.11'
npm warn EBADENGINE   required: { node: '^20.0.0 || ^22.0.0 || >=24.0.0' }
npm warn EBADENGINE   current: { node: 'v23.9.0' }
```

**Node 23 は奇数系のリリースで LTS ではなく、既にサポートが終了している。**
vitest が明示的に対象外にしているのはそのため。動いてはいるが、想定外の挙動を踏んでも切り分けが難しくなる。

`package.json` に `engines` を明示した。

```json
"engines": { "node": "^20.19.0 || ^22.12.0 || >=24.0.0" }
```

**Node 22 LTS か 24 LTS への移行を推奨する。**
