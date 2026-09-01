/**
 * 収録優先度（設計書 §4.5）
 *
 * ★これは内部の作業順であって、ユーザーに見せる順位ではない。
 *   D1 の公開テーブルにも API レスポンスにも載せない。
 *   一覧の並べ替えは「目的への適合順」のみ（§9.2-a）。
 *
 * ★収録の「可否」には使わない。
 *   可否は 宗教法人リスト / OSM / Wikidata の和集合で決める。
 *   分離しないと「Wikipedia に記事が無い＝存在しない」が構造化される。
 *   実測: 神道系神社 80,994社に対し ja.Wikipedia 記事があるのは 6,076社（7.5%）。
 *
 * 核となる指標は「正月比」。
 *   正月比 = 1月views ÷ 平常月viewsの中央値
 *   これが観光地と参拝地を分離する（実測・§4.5.2）:
 *     明治神宮 2.86（参拝地） / 浅草寺 2.03 / 清水寺 1.17（純粋な観光地）
 *   そして規模の壁を越える:
 *     廣瀬大社 1.72 > 伏見稲荷 1.59
 *     （総viewsは伏見稲荷の1/10なのに正月比では上回る）
 *   = 「マイナーだが実際に参拝されている社」の検出器
 */

import type { SitePriority } from './types'

/** 平常月。5月はGWで跳ねるので除外する */
export const BASE_MONTHS = [3, 4, 6, 7] as const

/** 正月比のクリップ上限。記事新規作成等の異常値対策 */
export const NEW_YEAR_RATIO_CLIP = 3.0

export interface MonthlyViews {
  /** 1..12 */
  month: number
  year: number
  views: number
}

/**
 * 中央値。
 * ★平均ではなく中央値を使う。ニュース由来のスパイクが混じるため
 *   （明治神宮 1/4 に 2,972 の不自然な山、田縣神社 3月 1,622 は豊年祭の話題性）。
 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  if (s.length % 2 === 1) return s[mid]!
  return (s[mid - 1]! + s[mid]!) / 2
}

/**
 * 当月のデータを除外する。
 * ★2026-08 は全記事で異常に低い値だった（伏見稲荷159、廣瀬42）= 未確定。
 */
export function excludeCurrentMonth(
  rows: MonthlyViews[],
  now = new Date(),
): MonthlyViews[] {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth() + 1
  return rows.filter((r) => !(r.year === y && r.month === m))
}

export interface NewYearMetrics {
  pvBaseMedian: number | null
  pvJanuary: number | null
  newYearRatio: number | null
  /** クリップが効いたか。データ品質の可視化に使う */
  clipped: boolean
}

/** 平常月中央値と正月比を求める */
export function computeNewYearRatio(
  rows: MonthlyViews[],
  now = new Date(),
): NewYearMetrics {
  const usable = excludeCurrentMonth(rows, now)
  const baseValues = usable
    .filter((r) => (BASE_MONTHS as readonly number[]).includes(r.month))
    .map((r) => r.views)
  const januaryValues = usable.filter((r) => r.month === 1).map((r) => r.views)

  const pvBaseMedian = median(baseValues)
  const pvJanuary = januaryValues.length > 0 ? median(januaryValues) : null

  if (pvBaseMedian === null || pvBaseMedian === 0 || pvJanuary === null) {
    return { pvBaseMedian, pvJanuary, newYearRatio: null, clipped: false }
  }
  const raw = pvJanuary / pvBaseMedian
  const clipped = raw > NEW_YEAR_RATIO_CLIP
  return {
    pvBaseMedian,
    pvJanuary,
    newYearRatio: Math.round(Math.min(raw, NEW_YEAR_RATIO_CLIP) * 100) / 100,
    clipped,
  }
}

// ─────────────────────────────────────────────────────────
// スコア
// ─────────────────────────────────────────────────────────

export const WEIGHTS = {
  pvBaseMedian: 0.35,
  newYearRatio: 0.3,
  officialVisitors: 0.25,
  sitelinks: 0.05,
  hasGoshuin: 0.05,
} as const

/**
 * 0..1 に正規化。母集団の最小・最大を使う。
 * 母集団の幅が無い（該当が1件だけ等）ときは、値を持っていること自体を 1 とする。
 * 値が無い場合は呼び出し側が normalize を通さずに 0 を入れる。
 */
export function normalize(value: number, min: number, max: number): number {
  if (max <= min) return value >= max ? 1 : 0
  return Math.max(0, Math.min(1, (value - min) / (max - min)))
}

export interface PriorityInput {
  siteId: string
  pvBaseMedian: number | null
  pvJanuary: number | null
  newYearRatio: number | null
  officialVisitors: number | null
  officialVisitorsYear?: number
  officialVisitorsSource?: string
  sitelinks: number | null
  hasGoshuin: boolean
  hasWikipediaArticle: boolean
  nearbyPopulation: number | null
}

export interface PriorityRanges {
  logPvBase: { min: number; max: number }
  newYearRatio: { min: number; max: number }
  logVisitors: { min: number; max: number }
  sitelinks: { min: number; max: number }
}

/** 母集団からレンジを求める */
export function computeRanges(inputs: PriorityInput[]): PriorityRanges {
  const logs = (vals: Array<number | null>) =>
    vals.filter((v): v is number => v !== null && v > 0).map((v) => Math.log(v))
  const nums = (vals: Array<number | null>) =>
    vals.filter((v): v is number => v !== null)

  const range = (arr: number[]) =>
    arr.length === 0 ? { min: 0, max: 0 } : { min: Math.min(...arr), max: Math.max(...arr) }

  return {
    logPvBase: range(logs(inputs.map((i) => i.pvBaseMedian))),
    newYearRatio: range(nums(inputs.map((i) => i.newYearRatio))),
    logVisitors: range(logs(inputs.map((i) => i.officialVisitors))),
    sitelinks: range(nums(inputs.map((i) => i.sitelinks))),
  }
}

/**
 * 収録優先度スコア。
 * 欠測は 0 として扱う（推測で埋めない）。
 * ★記事が無い社は必然的に低スコアになるので、
 *   noArticlePriority() で別系統の優先度を与えること。
 */
export function computeScore(
  input: PriorityInput,
  ranges: PriorityRanges,
): number {
  const pv =
    input.pvBaseMedian && input.pvBaseMedian > 0
      ? normalize(Math.log(input.pvBaseMedian), ranges.logPvBase.min, ranges.logPvBase.max)
      : 0
  const ny =
    input.newYearRatio !== null
      ? normalize(input.newYearRatio, ranges.newYearRatio.min, ranges.newYearRatio.max)
      : 0
  const ov =
    input.officialVisitors && input.officialVisitors > 0
      ? normalize(Math.log(input.officialVisitors), ranges.logVisitors.min, ranges.logVisitors.max)
      : 0
  const sl =
    input.sitelinks !== null
      ? normalize(input.sitelinks, ranges.sitelinks.min, ranges.sitelinks.max)
      : 0
  const gs = input.hasGoshuin ? 1 : 0

  const score =
    WEIGHTS.pvBaseMedian * pv +
    WEIGHTS.newYearRatio * ny +
    WEIGHTS.officialVisitors * ov +
    WEIGHTS.sitelinks * sl +
    WEIGHTS.hasGoshuin * gs

  return Math.round(score * 10000) / 10000
}

export function buildPriority(
  input: PriorityInput,
  ranges: PriorityRanges,
  now = new Date(),
): SitePriority {
  return {
    siteId: input.siteId,
    pvBaseMedian: input.pvBaseMedian,
    pvJanuary: input.pvJanuary,
    newYearRatio: input.newYearRatio,
    officialVisitors: input.officialVisitors,
    officialVisitorsYear: input.officialVisitorsYear,
    officialVisitorsSource: input.officialVisitorsSource,
    sitelinks: input.sitelinks,
    hasGoshuin: input.hasGoshuin,
    hasWikipediaArticle: input.hasWikipediaArticle,
    nearbyPopulation: input.nearbyPopulation,
    score: computeScore(input, ranges),
    computedAt: now.toISOString(),
  }
}

// ─────────────────────────────────────────────────────────
// 記事なし社の別系統優先度（★氏神様問題・§4.5.4）
// ─────────────────────────────────────────────────────────

export interface NoArticleSignals {
  /** 都道府県観光入込客統計に地点として掲載されている */
  officialVisitorsListed: boolean
  /** OSM に name がある（＝現地で認識されている）。神社の約33%は名前すら無い */
  osmHasName: boolean
  /** 式内社・一之宮・別表神社などの社格 */
  hasRank: boolean
  /** 近隣人口密度。Wikipediaに依存しない唯一の全国一様な代理指標 */
  nearbyPopulation: number | null
}

/**
 * ja.Wikipedia 記事が無い社（全神社の92.5%）の優先度。
 * pageview 系の指標が全て0になるため、別の信号で並べる。
 *
 * ★nearbyPopulation の仮説（氏神は氏子の数だけ参拝される）は未検証。
 *   Phase 1 で効果測定すること。
 */
export function noArticlePriority(
  s: NoArticleSignals,
  populationRange: { min: number; max: number },
): number {
  let score = 0
  if (s.officialVisitorsListed) score += 0.4
  if (s.hasRank) score += 0.2
  if (s.osmHasName) score += 0.1
  if (s.nearbyPopulation !== null) {
    score +=
      0.3 * normalize(s.nearbyPopulation, populationRange.min, populationRange.max)
  }
  return Math.round(score * 10000) / 10000
}
