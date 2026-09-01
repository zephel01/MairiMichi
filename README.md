# MairiMichi — まいり道

ご利益・**アクセス難易度**・御朱印で神社仏閣を探せる Web アプリ。
分類の根拠を、祭神・本尊と**一次史料（延喜式・風土記・六国史）**まで出典つきで示す。

公開URL（予定）: https://mairimichi.zephel01.workers.dev/
姉妹プロジェクト: [HitoriYado](https://hitoriyado.zephel01.workers.dev/)

## なぜ作るか

「ご利益 × 地図 × アクセス難易度 × 御朱印」を全部やっているサービスは存在しない（競合10サービスを実確認）。

- **ホトカミ**（16万件）… ご利益 ◎／御朱印 ◎／地図 ◎／**アクセス難易度 ✗**
- **八百万の神**（15万件）… 駅・バス・徒歩距離 ◎／祭神 ◎／地図 ◎／**ご利益 ✗**

この2社を足すと4軸が埋まる。どちらも相手の強みを持っていない。

## リポジトリ構成

```
.
├── app/          Next.js アプリ本体 ＋ コア層 ＋ ETL
│   ├── src/core/     ドメインロジック（型・祭神正規化・御利益導出・アクセス判定・標高・優先度）
│   ├── src/etl/      データ構築（延喜式パーサ・infobox抽出・穴検出）
│   └── tests/        Vitest（215 tests）
├── data/         人手で作るマスタ（★本プロジェクトの資産）
├── db/schema.sql D1 スキーマ
└── docs/         設計書・調査報告
```

## はじめに読むもの

| 目的 | ファイル |
|---|---|
| 何をなぜ作るか | `docs/2026-08-31_MairiMichi_要件定義設計書_v1.md` |
| 何がどこから取れるか | `docs/2026-08-31_MairiMichi_外部データ源調査報告_v1.md` |
| 次に何をやるか | `plan.md` / `docs/2026-09-01_MairiMichi_Phase1作業ログ_v1.md` |

## 開発

```bash
cd app
npm install
npm test        # Vitest（215 tests）
npm run typecheck
npm run build   # 17ページ生成
npm run dev     # http://localhost:3000
```

## この段階でできていること（Phase 1 コア層）

| モジュール | 中身 | テスト |
|---|---|---|
| `core/types.ts` | ドメイン型。確度・判定不能・出典必須を型で守る | — |
| `etl/classical/kansuji.ts` | 漢数字（大字・合字 廿卅 対応）。**欠字は推測せず null** | 11 |
| `etl/classical/shikinai.ts` | **延喜式神名帳パーサ**。`／…∥` 割注・二重 `／`・`〓` 欠字・文字化けに対応 | 20 |
| `etl/wikitext.ts` | infobox 祭神/本尊抽出。**リンク先記事名を正規化キーにする** | 22 |
| `core/deity.ts` | 神格クラスタ正規化。分裂QIDと表記ゆれを吸収 | 11 |
| `core/derive.ts` | 御利益導出。**primary/secondary の重み**と導出根拠 | 19 |
| `core/access.ts` | アクセス判定。**UNKNOWN を必ず持つ4値＋徒歩負荷** | 20 |
| `core/elevation.ts` | DEM タイルデコード＋累積標高。5A→5B→5C→10B フォールバック | 18 |
| `core/priority.ts` | **正月比**による収録優先度。中央値・クリップ・当月除外 | 16 |
| `core/etiquette.ts` | 参拝作法。**出典なしの例外は採用しない** | 12 |
| `etl/gaps.ts` | 穴検出。0件になる組み合わせが次の収録キュー | 10 |
| `data/loaders.ts` | **マスタの相互検証**。YAMLのタイプミスで導出が静かに壊れるのを止める | 23 |
| `etl/classical/wikisource-dump.ts` | zh.wikisource ダンプのストリーム走査 | 12 |
| `etl/priority/pageviews.ts` | pageview ダンプ／API。列数チェック・6秒間隔・指数バックオフ | 17 |

### UI（Phase 1e）

| ファイル | 中身 |
|---|---|
| `app/page.tsx` | 願い（大分類10）から探す入口 |
| `app/benefits/[major]/page.tsx` | 一覧。車なしで行ける／判定不能も含める／関連するご利益も含める |
| `app/sites/[id]/page.tsx` | 詳細（ご利益・導出根拠・アクセス・作法・御朱印・典拠） |
| `components/AccessBadge.tsx` | アクセス難易度。アイコン＋文言（色のみに依存しない） |
| `components/BenefitList.tsx` | 御利益＋導出根拠＋確度バッジ |
| `components/CitationPanel.tsx` | 典拠。層ラベル（一次史料／読み下し／近代／編集部） |
| `components/SiteMap.tsx` | Leaflet + 地理院タイル（標準＋陰影起伏） |
| `components/Attribution.tsx` | 全データ源の帰属表示（全ページ固定） |

## ETL

| コマンド | 内容 |
|---|---|
| `npm run etl:validate` | マスタ検証。**エラーがあれば exit 1**（CIに入れる） |
| `npm run etl:extract` | zh.wikisource ダンプから古典本文を抽出 |
| `npm run etl:shikinai` | 延喜式神名帳をパースして構造化 |
| `npm run etl:priority` | 正月比による収録優先度を計算 |
| `npm run etl:gaps` | 穴を検出して Markdown 出力 |

実行手順は `docs/2026-09-01_MairiMichi_Phase1作業ログ_v1.md` の §4 を参照。

## 設計上の約束（コードで守っていること）

1. **推定と一次情報を必ず区別する** — `Confidence: 'official' | 'derived' | 'unknown'`
2. **「判定不能」を必ず持つ** — `AccessMode.UNKNOWN`。二値に潰すとGTFS未整備地域を軒並み誤判定する
3. **作法は推定してはならない** — 出典URLの無い override は `resolveEtiquette` が採用しない
4. **出典なしの言説は作れない** — `SiteLore.sourceUrl` は必須。DB にも `CHECK` 制約
5. **効果を断定しない** — 「効きます」ではなく「信仰されています」
6. **収録優先度は公開しない** — `SitePriority` は D1 スキーマに含めない
7. **順位を付けない** — 並べ替えは「目的への適合順」のみ
8. **欠字・パース失敗を黙って捨てない** — `rawNote` / `unparsed` / `defects` に残す

## 運用ルール

### ブランチ

- `main` … 常に `npm test` / `npm run typecheck` が緑
- `feat/<内容>` `fix/<内容>` … 作業ブランチ。**main への直接コミット・push は禁止**

### コミットメッセージ

Conventional Commits（`feat:` `fix:` `refactor:` `docs:` `test:` `chore:`）

### ドキュメントの昇格

Cowork セッションの出力は `_OUTPUTS/` に生成する（Git 管理外）。
残す価値があると判断したものだけ `docs/` へ移動してコミットする。

### 帰属表示

`app/src/components/Attribution.tsx` に全データ源の出典を固定表示している。**消さないこと。**

### 秘密情報

ODPT の consumerKey は環境変数でのみ扱う。`.env.local` / `.dev.vars` は `.gitignore` 済み。
