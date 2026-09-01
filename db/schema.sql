-- MairiMichi D1 スキーマ v1
-- 設計書 §11 データ設計 に対応
--
-- ★site_priority は「収録優先度」で内部専用。
--   このスキーマには意図的に含めない。ETL 側のローカルDBにのみ置くこと（§4.5.5）。

PRAGMA foreign_keys = ON;

-- ─────────────────────────────────────────────────────────
-- 社寺
-- ─────────────────────────────────────────────────────────
CREATE TABLE site (
  id              TEXT PRIMARY KEY,
  osm_id          TEXT,
  wikidata_id     TEXT,
  name            TEXT NOT NULL,
  name_kana       TEXT,
  name_en         TEXT,
  type            TEXT NOT NULL CHECK (type IN ('shrine','temple')),
  denomination    TEXT,
  prefecture_code TEXT NOT NULL,
  city_code       TEXT,
  area_id         TEXT,
  address         TEXT,
  lat             REAL NOT NULL,
  lng             REAL NOT NULL,
  founded_year    INTEGER,
  official_url    TEXT,
  -- 事実バッジ（式内社 / 一之宮 / 別表神社 / 国宝 ...）。JSON配列
  ranks           TEXT NOT NULL DEFAULT '[]',
  -- 確認済み項目の可視化（人気ではなく情報の充実度・§9.2-d）
  dq_benefit      INTEGER NOT NULL DEFAULT 0,
  dq_etiquette    INTEGER NOT NULL DEFAULT 0,
  dq_goshuin      INTEGER NOT NULL DEFAULT 0,
  dq_access       INTEGER NOT NULL DEFAULT 0,
  dq_citation     INTEGER NOT NULL DEFAULT 0,
  updated_at      TEXT NOT NULL
);
CREATE INDEX idx_site_pref ON site(prefecture_code);
CREATE INDEX idx_site_area ON site(area_id);
CREATE INDEX idx_site_type ON site(type);
CREATE INDEX idx_site_geo  ON site(lat, lng);

-- ─────────────────────────────────────────────────────────
-- 祭神・神格クラスタ
-- ─────────────────────────────────────────────────────────
CREATE TABLE deity_cluster (
  id        TEXT PRIMARY KEY,
  label     TEXT NOT NULL,
  religion  TEXT NOT NULL CHECK (religion IN ('shinto','buddhist')),
  -- 分裂したQIDをまとめる（八幡神 Q261637 ⇔ 応神天皇 Q317997 など）。JSON配列
  qids      TEXT NOT NULL DEFAULT '[]',
  aliases   TEXT NOT NULL DEFAULT '[]',
  -- 人物神・阿弥陀如来など定型マッピングが無いもの
  policy    TEXT CHECK (policy IN ('NO_AUTO_MAPPING','NO_CURRENT_BENEFIT'))
);

CREATE TABLE site_deity (
  site_id     TEXT NOT NULL REFERENCES site(id) ON DELETE CASCADE,
  display     TEXT NOT NULL,
  link_target TEXT,
  cluster_id  TEXT REFERENCES deity_cluster(id),
  -- ★infobox からは主祭神と相殿神を機械的に分離できない。多くが 'unknown'
  role        TEXT NOT NULL DEFAULT 'unknown' CHECK (role IN ('main','aidono','unknown')),
  source      TEXT NOT NULL CHECK (source IN ('wikidata','jawp','manual')),
  matched_by  TEXT CHECK (matched_by IN ('qid','linkTarget','alias')),
  PRIMARY KEY (site_id, display)
);
CREATE INDEX idx_site_deity_cluster ON site_deity(cluster_id);

-- ─────────────────────────────────────────────────────────
-- 御利益
-- ─────────────────────────────────────────────────────────
CREATE TABLE benefit (
  id       TEXT PRIMARY KEY,   -- 細分類ID
  major_id TEXT NOT NULL,      -- 大分類ID（10種）
  label    TEXT NOT NULL,
  sort_no  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE cluster_benefit (
  cluster_id TEXT NOT NULL REFERENCES deity_cluster(id) ON DELETE CASCADE,
  benefit_id TEXT NOT NULL REFERENCES benefit(id),
  -- ★一覧の絞り込みは既定で primary のみ（1寺社10タグ問題の対策）
  weight     TEXT NOT NULL CHECK (weight IN ('primary','secondary')),
  PRIMARY KEY (cluster_id, benefit_id)
);

CREATE TABLE site_benefit (
  site_id        TEXT NOT NULL REFERENCES site(id) ON DELETE CASCADE,
  benefit_id     TEXT NOT NULL REFERENCES benefit(id),
  major_id       TEXT NOT NULL,
  weight         TEXT NOT NULL CHECK (weight IN ('primary','secondary')),
  -- ★UI に必ず出す。約3割は 'unknown' になる
  confidence     TEXT NOT NULL CHECK (confidence IN ('official','derived','unknown')),
  -- ★導出根拠（F-02）。derived なら必須
  derived_deity  TEXT,
  derived_cluster TEXT,
  -- official なら必須
  source_url     TEXT,
  PRIMARY KEY (site_id, benefit_id),
  CHECK (confidence <> 'official' OR source_url IS NOT NULL),
  CHECK (confidence <> 'derived'  OR derived_deity IS NOT NULL)
);
CREATE INDEX idx_site_benefit_major ON site_benefit(major_id, weight);
CREATE INDEX idx_site_benefit_b     ON site_benefit(benefit_id, weight);

-- ─────────────────────────────────────────────────────────
-- 参拝作法（★推定禁止。例外は一次情報の出典が必須）
-- ─────────────────────────────────────────────────────────
CREATE TABLE etiquette (
  site_id     TEXT PRIMARY KEY REFERENCES site(id) ON DELETE CASCADE,
  bow_before  INTEGER NOT NULL,
  clap        INTEGER NOT NULL,   -- 寺院は 0
  bow_after   INTEGER NOT NULL,
  label       TEXT NOT NULL,
  notes       TEXT,
  source_url  TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('official','default','pending')),
  verified_at TEXT,
  -- ★official を名乗るなら出典URLが必ず要る
  CHECK (source_type <> 'official' OR source_url IS NOT NULL)
);

-- ─────────────────────────────────────────────────────────
-- 御朱印（★ホトカミですら持っていない実務情報）
-- ─────────────────────────────────────────────────────────
CREATE TABLE goshuin (
  site_id           TEXT PRIMARY KEY REFERENCES site(id) ON DELETE CASCADE,
  available         TEXT NOT NULL CHECK (available IN ('yes','no','unknown')),
  hours_from        TEXT,   -- 参拝時間とは別。御朱印の受付時間
  hours_to          TEXT,
  lunch_from        TEXT,
  lunch_to          TEXT,
  write_style       TEXT NOT NULL DEFAULT 'unknown'
                      CHECK (write_style IN ('direct','paper','both','seasonal','unknown')),
  fee               INTEGER,
  unmanned          INTEGER,
  limited_note      TEXT,
  mail_order        TEXT CHECK (mail_order IN ('yes','no','unknown')),
  denomination_note TEXT,   -- 浄土真宗・日蓮宗のルール
  source_url        TEXT,
  -- ★変わりやすい情報。UIに「◯ヶ月前の情報」と出す
  verified_at       TEXT
);

-- ─────────────────────────────────────────────────────────
-- アクセス（★UNKNOWN を必ず持つ）
-- ─────────────────────────────────────────────────────────
CREATE TABLE access (
  site_id        TEXT PRIMARY KEY REFERENCES site(id) ON DELETE CASCADE,
  access_mode    TEXT NOT NULL CHECK (access_mode IN
                   ('TRAIN_ONLY','TRAIN_BUS','CAR_RECOMMENDED','CAR_ONLY','UNKNOWN')),
  walk_load      TEXT NOT NULL CHECK (walk_load IN ('EASY','MODERATE','HARD')),
  station_json   TEXT,   -- StationRef
  busstop_json   TEXT,   -- BusStopRef（trips_* が NULL なら GTFS未整備）
  walk_distance_m INTEGER,
  walk_minutes   INTEGER,
  ascent_m       REAL,
  descent_m      REAL,
  relief_around_m REAL,
  -- ★判定理由。UNKNOWN のときそのまま画面に出す
  reason         TEXT NOT NULL,
  computed_at    TEXT NOT NULL
);
CREATE INDEX idx_access_mode ON access(access_mode, walk_load);

-- ─────────────────────────────────────────────────────────
-- 典拠（古典・史料）
-- ─────────────────────────────────────────────────────────
CREATE TABLE classical_source (
  id            TEXT PRIMARY KEY,
  work          TEXT NOT NULL,
  title         TEXT NOT NULL,
  volume        TEXT,
  section       TEXT,
  original_text TEXT NOT NULL,   -- 漢文原文（★PD）
  reading       TEXT,            -- 書き下し（PD由来のみ）
  modern_ja     TEXT,            -- 現代語訳（武田祐吉版などPDのみ）
  provenance    TEXT NOT NULL CHECK (provenance IN ('zh.wikisource','aozora','kokugakuin','ndl')),
  rights        TEXT NOT NULL CHECK (rights IN ('PD','CC-BY-SA-4.0','PD+CC-BY-SA-4.0')),
  source_url    TEXT NOT NULL
);

CREATE TABLE site_citation (
  site_id             TEXT NOT NULL REFERENCES site(id) ON DELETE CASCADE,
  classical_source_id TEXT NOT NULL REFERENCES classical_source(id),
  layer               INTEGER NOT NULL CHECK (layer IN (1,2,3)),
  benefit_id          TEXT REFERENCES benefit(id),
  connection_type     TEXT NOT NULL CHECK (connection_type IN
                        ('myth','shikinai_rank','shinkai','fudoki','modern')),
  editor_note         TEXT,   -- 第4層。層ラベルを付けて表示する
  -- NDL 由来なら 1 →「OCRのため誤りを含む場合があります」を出す
  ocr_warning         INTEGER NOT NULL DEFAULT 0,
  verified_at         TEXT,
  PRIMARY KEY (site_id, classical_source_id, layer)
);

-- 延喜式神名帳の構造化
CREATE TABLE shikinai_record (
  site_id          TEXT REFERENCES site(id) ON DELETE SET NULL,
  province         TEXT NOT NULL,
  district         TEXT NOT NULL,
  shrine_name      TEXT NOT NULL,
  rank             TEXT CHECK (rank IN ('myojin_tai','tai','sho')),
  offering         TEXT CHECK (offering IN ('kanpei','kokuhei')),
  offering_detail  TEXT CHECK (offering_detail IN ('anjo','ange')),
  tsukinami        INTEGER NOT NULL DEFAULT 0,
  niiname          INTEGER NOT NULL DEFAULT 0,
  ainame           INTEGER NOT NULL DEFAULT 0,
  seats            INTEGER NOT NULL DEFAULT 1,
  -- ★割注の原文。〓 欠字を含みうるので必ず残す
  raw_note         TEXT NOT NULL,
  has_defect       INTEGER NOT NULL DEFAULT 0,
  -- 論社が複数ある場合の同一記載グループ
  candidate_of     TEXT,
  PRIMARY KEY (province, district, shrine_name)
);
CREATE INDEX idx_shikinai_site ON shikinai_record(site_id);

-- 神階（國學院 神道・神社史料集成（古代）約450社）
CREATE TABLE shinkai (
  site_id     TEXT NOT NULL REFERENCES site(id) ON DELETE CASCADE,
  year        INTEGER,
  rank        TEXT NOT NULL,
  source_text TEXT NOT NULL,   -- 六国史の該当記事原文
  source_book TEXT NOT NULL
);
CREATE INDEX idx_shinkai_site ON shinkai(site_id);

-- 層C1: 社伝・公式の言説（★出典なしでは作れない）
CREATE TABLE site_lore (
  site_id     TEXT NOT NULL REFERENCES site(id) ON DELETE CASCADE,
  benefit_id  TEXT REFERENCES benefit(id),
  text        TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('official','shaden','municipal','classical')),
  source_url  TEXT NOT NULL,      -- ★必須
  source_name TEXT NOT NULL,
  verified_at TEXT
);
CREATE INDEX idx_lore_site ON site_lore(site_id);

-- ─────────────────────────────────────────────────────────
-- 巡礼グループ
-- ─────────────────────────────────────────────────────────
CREATE TABLE pilgrimage_group (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN
                ('fudasho','seven_gods','three_shrines','ichinomiya','sandai','local')),
  name        TEXT NOT NULL,
  total_count INTEGER,
  region      TEXT,
  numbered    INTEGER NOT NULL DEFAULT 0,
  -- 「日本三大◯◯」で諸説あるもの。UIに「諸説あり」を出す
  disputed    INTEGER NOT NULL DEFAULT 0,
  source_url  TEXT
);

CREATE TABLE site_group (
  site_id  TEXT NOT NULL REFERENCES site(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES pilgrimage_group(id) ON DELETE CASCADE,
  order_no INTEGER,
  role     TEXT,   -- 七福神なら担当の神
  PRIMARY KEY (site_id, group_id)
);
CREATE INDEX idx_site_group_g ON site_group(group_id, order_no);

-- ─────────────────────────────────────────────────────────
-- 願いの内訳（★効果ではなく意図の集計・§9.1.6）
-- ─────────────────────────────────────────────────────────
CREATE TABLE wish_tally (
  site_id    TEXT NOT NULL REFERENCES site(id) ON DELETE CASCADE,
  benefit_id TEXT NOT NULL REFERENCES benefit(id),
  count      INTEGER NOT NULL DEFAULT 0,
  -- 祭神からは導出されていないのに願われている = 手動キュレーションの最優先対象
  unexplained_by_deity INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (site_id, benefit_id)
);

-- ─────────────────────────────────────────────────────────
-- エリア（行政区画とは別の、参拝で回れる単位）
-- ─────────────────────────────────────────────────────────
CREATE TABLE area (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  prefecture_code TEXT NOT NULL,
  region          TEXT NOT NULL,   -- 8地方区分
  description     TEXT
);
