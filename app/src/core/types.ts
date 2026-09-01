/**
 * MairiMichi ドメイン型
 * 設計書 §11 データ設計 に対応する。
 *
 * 設計上の約束（型で守れるところは型で守る）:
 *  - 推定と一次情報を必ず区別する → Confidence
 *  - 「判定不能」を必ず持つ         → AccessMode.UNKNOWN / Confidence.UNKNOWN
 *  - 出典なしの言説は作れない       → SiteLore.sourceUrl は必須
 *  - 収録優先度は公開しない         → SitePriority は PublicSite に含めない
 */

// ─────────────────────────────────────────────────────────
// 御利益
// ─────────────────────────────────────────────────────────

/** 大分類10（benefits.yaml の majors.id） */
export type BenefitMajorId =
  | 'enmusubi'
  | 'shoubai'
  | 'gakugyou'
  | 'kenkou'
  | 'yakuyoke'
  | 'anzan'
  | 'koutsuu'
  | 'shoubu'
  | 'kanai'
  | 'nariwai'

/** 細分類（benefits.yaml の minors.id） */
export type BenefitMinorId = string

export interface BenefitMinor {
  id: BenefitMinorId
  label: string
}

export interface BenefitMajor {
  id: BenefitMajorId
  label: string
  minors: BenefitMinor[]
  typicalShinto?: string
  typicalBuddhist?: string
  /** 追加した分類はその根拠を持たせる（§5.2） */
  addedReason?: string
  /** 表示上の注意（病気平癒など） */
  note?: string
}

/** 主/副の重み。一覧の絞り込みは既定で primary のみ（§5.4） */
export type BenefitWeight = 'primary' | 'secondary'

/**
 * 確度。UI に必ず出す（§2.2-2）。
 * 約3割は unknown になる前提で設計する。
 */
export type Confidence = 'official' | 'derived' | 'unknown'

// ─────────────────────────────────────────────────────────
// 祭神・神格クラスタ
// ─────────────────────────────────────────────────────────

export type Religion = 'shinto' | 'buddhist'

/**
 * 神格クラスタ。
 * Wikidata では同一の信仰対象が別QIDに分裂しているため
 * （八幡神 Q261637 ⇔ 応神天皇 Q317997 など）、必ずここに寄せてから
 * 御利益を引く。素朴な神名マッチ 49% がクラスタ化で 68.5% になる。
 */
export interface DeityCluster {
  id: string
  label: string
  religion: Religion
  /** Wikidata QID（複数。分裂している同一神格をまとめる） */
  qids: string[]
  /** 表記ゆれ・別名。ja.Wikipedia のリンク先記事名と素テキストの両方を含む */
  aliases: string[]
  /** 定型マッピングが存在しないクラスタ（人物神など） */
  benefitPolicy?: 'NO_AUTO_MAPPING' | 'NO_CURRENT_BENEFIT'
  note?: string
}

export interface ClusterBenefit {
  cluster: string
  primary: BenefitMinorId[]
  secondary: BenefitMinorId[]
  policy?: 'NO_AUTO_MAPPING' | 'NO_CURRENT_BENEFIT'
  note?: string
}

/**
 * infobox から抽出した祭神の1件。
 * 相殿・配神は主祭神と同一フィールドに並ぶため機械的に分離できない。
 * role は多くが 'unknown' になる（§16.2）。
 */
export interface ExtractedDeity {
  /** 表示名（infobox に書かれていた文字列） */
  display: string
  /** ja.Wikipedia のリンク先記事名。★正規化キーはこちらを優先する */
  linkTarget: string | null
  role: 'main' | 'aidono' | 'unknown'
  source: 'wikidata' | 'jawp' | 'manual'
}

/** 神格クラスタへの正規化結果 */
export interface NormalizedDeity extends ExtractedDeity {
  clusterId: string | null
  /** 何で一致したか。デバッグとデータ品質の可視化に使う */
  matchedBy: 'qid' | 'linkTarget' | 'alias' | null
}

// ─────────────────────────────────────────────────────────
// 導出された御利益（F-02 導出根拠の表示 の実体）
// ─────────────────────────────────────────────────────────

export interface DerivedBenefit {
  benefitId: BenefitMinorId
  majorId: BenefitMajorId
  weight: BenefitWeight
  confidence: Confidence
  /** どの祭神から導いたか。UI に必ず出す */
  derivedFromDeity: string | null
  derivedFromCluster: string | null
  /** confidence === 'official' のとき必須 */
  sourceUrl?: string
}

// ─────────────────────────────────────────────────────────
// 参拝作法（§7）
// ─────────────────────────────────────────────────────────

/**
 * 作法は推定してはならない。
 * 例外の登録は一次情報の URL が取れた場合のみ。
 */
export type EtiquetteSourceType = 'official' | 'default' | 'pending'

export interface Etiquette {
  bowBefore: number
  /** 拍手の回数。寺院は 0 */
  clap: number
  bowAfter: number
  label: string
  notes?: string
  sourceUrl: string | null
  sourceType: EtiquetteSourceType
  verifiedAt?: string
}

// ─────────────────────────────────────────────────────────
// 御朱印（§8.1）
// ─────────────────────────────────────────────────────────

export type Availability = 'yes' | 'no' | 'unknown'
export type WriteStyle = 'direct' | 'paper' | 'both' | 'seasonal' | 'unknown'

export interface Goshuin {
  available: Availability
  /** 参拝時間とは別。御朱印の受付時間 */
  hours?: { from: string; to: string }
  lunchBreak?: { from: string; to: string }
  writeStyle: WriteStyle
  fee?: number
  unmanned?: boolean
  limitedNote?: string
  mailOrder?: Availability
  /** 宗派由来の注記（浄土真宗・日蓮宗） */
  denominationNote?: string
  sourceUrl?: string
  /** 変わりやすい情報なので鮮度を必ず出す */
  verifiedAt?: string
}

// ─────────────────────────────────────────────────────────
// アクセス（§6）
// ─────────────────────────────────────────────────────────

/**
 * 到達手段。
 * ★UNKNOWN を必ず持つこと。二値に潰すと GTFS 未整備地域の社寺を
 *   軒並み「車必須」と誤判定する。
 */
export type AccessMode =
  | 'TRAIN_ONLY'
  | 'TRAIN_BUS'
  | 'CAR_RECOMMENDED'
  | 'CAR_ONLY'
  | 'UNKNOWN'

export type WalkLoad = 'EASY' | 'MODERATE' | 'HARD'

export interface StationRef {
  name: string
  lineName: string
  /** N02_005g グループコード。乗換駅の名寄せに使う */
  groupCode?: string
  distanceM: number
  walkMin: number
}

export interface BusStopRef {
  name: string
  operator: string
  distanceM: number
  walkMin: number
  /** GTFS から集計した日次便数。null は「GTFS未整備で不明」 */
  tripsWeekday: number | null
  tripsSat: number | null
  tripsSun: number | null
  /** 便数が null のときの理由。UI にそのまま出す */
  unknownReason?: string
  /** その系統が鉄道駅に接続するか */
  connectsToStation?: boolean
}

export interface AccessAssessment {
  accessMode: AccessMode
  walkLoad: WalkLoad
  nearestStation: StationRef | null
  nearestBusStop: BusStopRef | null
  walkDistanceM: number | null
  walkMinutes: number | null
  /** 累積登り。徒歩負荷の核 */
  ascentM: number | null
  descentM: number | null
  /** 境内周辺の起伏（HitoriYado の relief と同じ導出） */
  reliefAroundM: number | null
  /** 判定理由。UNKNOWN のとき特に重要 */
  reason: string
  computedAt: string
}

// ─────────────────────────────────────────────────────────
// 典拠（§5.6）
// ─────────────────────────────────────────────────────────

export type ShikinaiRank = 'myojin_tai' | 'tai' | 'sho'
export type Offering = 'kanpei' | 'kokuhei' | null

/** 延喜式神名帳の1レコード */
export interface ShikinaiRecord {
  province: string
  district: string
  shrineName: string
  rank: ShikinaiRank
  offering: Offering
  /** 案上/案下の別（官幣のとき） */
  offeringDetail?: 'anjo' | 'ange' | null
  tsukinami: boolean
  niiname: boolean
  ainame: boolean
  seats: number
  /** 割注の原文。〓 欠字を含みうるので必ず残す */
  rawNote: string
  /** 欠字や文字化けを検出したか。UI で「原文に欠字あり」と出す */
  hasDefect: boolean
}

export type ClassicalWork =
  | 'engishiki'
  | 'kojiki'
  | 'nihonshoki'
  | 'fudoki'
  | 'rikkokushi'
  | 'kujiki'

export type SourceRights = 'PD' | 'CC-BY-SA-4.0' | 'PD+CC-BY-SA-4.0'

export interface ClassicalSource {
  id: string
  work: ClassicalWork
  title: string
  volume?: string
  section?: string
  /** 漢文原文。★パブリックドメイン */
  originalText: string
  /** 書き下し。PD 由来のもののみ */
  reading?: string
  /** 現代語訳。武田祐吉版などPDのみ */
  modernJa?: string
  provenance: 'zh.wikisource' | 'aozora' | 'kokugakuin' | 'ndl'
  rights: SourceRights
  sourceUrl: string
}

/** §5.6.6 接続の型 */
export type ConnectionType =
  | 'myth'
  | 'shikinai_rank'
  | 'shinkai'
  | 'fudoki'
  | 'modern'

export interface SiteCitation {
  classicalSourceId: string
  /** 1=一次史料 2=読み下し・現代語 3=近代の記録 */
  layer: 1 | 2 | 3
  benefitId?: BenefitMinorId
  connectionType: ConnectionType
  /** 第4層。編集部の接続。層ラベルを付けて表示する */
  editorNote?: string
  /** NDL 由来なら true → 「OCRのため誤りを含む場合があります」を出す */
  ocrWarning: boolean
  verifiedAt?: string
}

/** 層C1: 社伝・公式の言説。出典なしでは作れない */
export interface SiteLore {
  benefitId?: BenefitMinorId
  text: string
  sourceType: 'official' | 'shaden' | 'municipal' | 'classical'
  /** 【必須】 */
  sourceUrl: string
  sourceName: string
  verifiedAt?: string
}

// ─────────────────────────────────────────────────────────
// 巡礼グループ（§13）
// ─────────────────────────────────────────────────────────

export type PilgrimageKind =
  | 'fudasho'
  | 'seven_gods'
  | 'three_shrines'
  | 'ichinomiya'
  | 'sandai'
  | 'local'

export interface PilgrimageGroup {
  id: string
  kind: PilgrimageKind
  name: string
  totalCount?: number
  region?: string
  numbered?: boolean
  /** 「日本三大◯◯」で諸説あるもの */
  disputed?: boolean
  sourceUrl?: string
}

export interface GroupMembership {
  groupId: string
  orderNo?: number
  /** 七福神なら担当の神 */
  role?: string
}

// ─────────────────────────────────────────────────────────
// 社寺
// ─────────────────────────────────────────────────────────

export type SiteType = 'shrine' | 'temple'

/** 確認済み項目の可視化（§9.2-d 「人気ではなく情報の充実度」） */
export interface DataQuality {
  benefit: boolean
  etiquette: boolean
  goshuin: boolean
  access: boolean
  citation: boolean
}

export interface Site {
  id: string
  osmId?: string
  wikidataId?: string
  name: string
  nameKana?: string
  nameEn?: string
  type: SiteType
  /** 宗派（寺院）／系統（神社） */
  denomination?: string
  prefectureCode: string
  cityCode?: string
  areaId?: string
  address?: string
  lat: number
  lng: number
  foundedYear?: number
  officialUrl?: string
  /** 式内社 / 一之宮 / 別表神社 など。事実バッジ用 */
  rank?: string[]
  deities: NormalizedDeity[]
  benefits: DerivedBenefit[]
  etiquette: Etiquette
  goshuin?: Goshuin
  access?: AccessAssessment
  shikinai?: ShikinaiRecord
  citations: SiteCitation[]
  lore: SiteLore[]
  groups: GroupMembership[]
  dataQuality: DataQuality
}

// ─────────────────────────────────────────────────────────
// 参拝記録と願いの内訳（§9.1.6）
// ─────────────────────────────────────────────────────────

export interface Visit {
  siteId: string
  visitedAt: string
  goshuinReceived: boolean
  notebookName?: string
  notebookPage?: number
  note?: string
  /** ★何を願ったか。効果ではなく意図の記録 */
  wishBenefitIds: BenefitMinorId[]
}

/**
 * 願いの内訳。
 * 「この社に記録を残した人が願ったこと」であり、効果の保証ではない。
 * 祭神から導出されない御利益がここで上位に来る社は、
 * 祭神では説明できない信仰実態がある = 手動キュレーションの最優先対象。
 */
export interface WishTally {
  siteId: string
  benefitId: BenefitMinorId
  count: number
  /** 祭神からは導出されていないのに願われている = 要注目 */
  unexplainedByDeity: boolean
  updatedAt: string
}

// ─────────────────────────────────────────────────────────
// 収録優先度（★内部のみ。公開テーブルにもAPIにも載せない §4.5.5）
// ─────────────────────────────────────────────────────────

export interface SitePriority {
  siteId: string
  /** 平常月viewsの中央値（3,4,6,7月）。★平均ではない */
  pvBaseMedian: number | null
  pvJanuary: number | null
  /** 正月比 = pvJanuary / pvBaseMedian。3.0でクリップ */
  newYearRatio: number | null
  /** 都道府県観光入込客統計の実数 */
  officialVisitors: number | null
  officialVisitorsYear?: number
  officialVisitorsSource?: string
  sitelinks: number | null
  hasGoshuin: boolean
  /** false の社は別系統の優先度へ（§4.5.4） */
  hasWikipediaArticle: boolean
  /** 記事なし社の唯一の全国一様な代理指標 */
  nearbyPopulation: number | null
  score: number
  computedAt: string
}

/**
 * 公開する社寺データ。
 * ★SitePriority を含まないことを型で保証する。
 */
export type PublicSite = Omit<Site, never> & { priority?: never }
