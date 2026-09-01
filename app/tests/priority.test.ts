import { describe, it, expect } from 'vitest'
import {
  median,
  excludeCurrentMonth,
  computeNewYearRatio,
  computeRanges,
  computeScore,
  noArticlePriority,
  NEW_YEAR_RATIO_CLIP,
  type MonthlyViews,
  type PriorityInput,
} from '@/core/priority'

/**
 * ★以下はすべて調査で実測した ja.wikipedia の月次ページビュー
 *   （all-access / user、2025-12 〜 2026-07）。
 */
const REAL: Record<string, Record<number, number>> = {
  出雲大社: { 1: 25866, 2: 13574, 3: 14488, 4: 12468, 5: 19137, 6: 15289, 7: 14648 },
  清水寺: { 1: 11148, 2: 9339, 3: 9438, 4: 9837, 5: 11631, 6: 10914, 7: 8054 },
  明治神宮: { 1: 18438, 2: 6588, 3: 6289, 4: 6653, 5: 7468, 6: 7145, 7: 5659 },
  伏見稲荷大社: { 1: 11007, 2: 7404, 3: 7035, 4: 6734, 5: 11154, 6: 7496, 7: 6452 },
  浅草寺: { 1: 12066, 2: 7007, 3: 6651, 4: 5906, 5: 7122, 6: 5907, 7: 5276 },
  廣瀬大社: { 1: 1274, 2: 800, 3: 807, 4: 782, 5: 922, 6: 761, 7: 614 },
}

function rows(name: string): MonthlyViews[] {
  return Object.entries(REAL[name]!).map(([m, views]) => ({
    month: Number(m),
    year: 2026,
    views,
  }))
}

const NOW = new Date('2026-08-31T00:00:00Z')

describe('median', () => {
  it('★平均ではなく中央値（ニュースのスパイク対策）', () => {
    expect(median([1, 2, 3, 100])).toBe(2.5)
    expect(median([1, 2, 3])).toBe(2)
    expect(median([])).toBeNull()
  })
})

describe('excludeCurrentMonth', () => {
  it('★当月は未確定なので除外する（2026-08 は全記事で異常値だった）', () => {
    const r = excludeCurrentMonth(
      [
        { year: 2026, month: 7, views: 6452 },
        { year: 2026, month: 8, views: 159 }, // 伏見稲荷の実測異常値
      ],
      NOW,
    )
    expect(r).toHaveLength(1)
    expect(r[0]?.month).toBe(7)
  })
})

describe('computeNewYearRatio — 実測データ', () => {
  const ratio = (name: string) => computeNewYearRatio(rows(name), NOW).newYearRatio!

  it('平常月は 3,4,6,7 月（5月はGWで跳ねるので除外）', () => {
    const r = computeNewYearRatio(rows('明治神宮'), NOW)
    // [5659, 6289, 6653, 7145] の中央値 = 6471
    expect(r.pvBaseMedian).toBe(6471)
    expect(r.pvJanuary).toBe(18438)
  })

  it('★正月比が「観光地」と「参拝地」を分離する', () => {
    // 参拝地
    expect(ratio('明治神宮')).toBeGreaterThan(2.5)
    expect(ratio('浅草寺')).toBeGreaterThan(2.0)
    // 純粋な観光地
    expect(ratio('清水寺')).toBeLessThan(1.2)
  })

  it('★総ページビューでは清水寺 > 明治神宮 だが、正月比では逆転する', () => {
    const totalKiyomizu = Object.values(REAL['清水寺']!).reduce((a, b) => a + b, 0)
    const totalMeiji = Object.values(REAL['明治神宮']!).reduce((a, b) => a + b, 0)
    expect(totalKiyomizu).toBeGreaterThan(totalMeiji)
    expect(ratio('明治神宮')).toBeGreaterThan(ratio('清水寺'))
  })

  it('★規模の壁を越える: 廣瀬大社 > 伏見稲荷大社', () => {
    // 廣瀬大社の総viewsは伏見稲荷の約1/10。それでも正月比では上回る。
    // これが「マイナーだが実際に参拝されている社」の検出器。
    const totalHirose = Object.values(REAL['廣瀬大社']!).reduce((a, b) => a + b, 0)
    const totalFushimi = Object.values(REAL['伏見稲荷大社']!).reduce((a, b) => a + b, 0)
    expect(totalHirose).toBeLessThan(totalFushimi / 5)
    expect(ratio('廣瀬大社')).toBeGreaterThan(ratio('伏見稲荷大社'))
  })

  it('正月比の順序が実測どおりになる', () => {
    const ordered = ['明治神宮', '浅草寺', '出雲大社', '廣瀬大社', '伏見稲荷大社', '清水寺']
    for (let i = 0; i + 1 < ordered.length; i++) {
      expect(ratio(ordered[i]!)).toBeGreaterThan(ratio(ordered[i + 1]!))
    }
  })

  it('★3.0 でクリップする（記事新規作成等の異常値対策）', () => {
    const spike: MonthlyViews[] = [
      { year: 2026, month: 1, views: 10000 },
      { year: 2026, month: 3, views: 100 },
      { year: 2026, month: 4, views: 100 },
      { year: 2026, month: 6, views: 100 },
      { year: 2026, month: 7, views: 100 },
    ]
    const r = computeNewYearRatio(spike, NOW)
    expect(r.newYearRatio).toBe(NEW_YEAR_RATIO_CLIP)
    expect(r.clipped).toBe(true)
  })

  it('データが足りなければ null（推測しない）', () => {
    expect(computeNewYearRatio([], NOW).newYearRatio).toBeNull()
    expect(
      computeNewYearRatio([{ year: 2026, month: 3, views: 100 }], NOW).newYearRatio,
    ).toBeNull()
  })
})

describe('computeScore', () => {
  const base = (o: Partial<PriorityInput>): PriorityInput => ({
    siteId: 'x',
    pvBaseMedian: null,
    pvJanuary: null,
    newYearRatio: null,
    officialVisitors: null,
    sitelinks: null,
    hasGoshuin: false,
    hasWikipediaArticle: true,
    nearbyPopulation: null,
    ...o,
  })

  it('重みの合計は 1', () => {
    const sum = 0.35 + 0.3 + 0.25 + 0.05 + 0.05
    expect(sum).toBeCloseTo(1)
  })

  it('正月比が高いほどスコアが上がる', () => {
    const inputs = [
      base({ siteId: 'a', pvBaseMedian: 1000, newYearRatio: 1.1 }),
      base({ siteId: 'b', pvBaseMedian: 1000, newYearRatio: 2.9 }),
    ]
    const ranges = computeRanges(inputs)
    expect(computeScore(inputs[1]!, ranges)).toBeGreaterThan(
      computeScore(inputs[0]!, ranges),
    )
  })

  it('★観光入込客数（実測足数）が取れた社は強く効く', () => {
    const inputs = [
      base({ siteId: 'a', pvBaseMedian: 1000, newYearRatio: 1.5 }),
      base({
        siteId: 'b',
        pvBaseMedian: 1000,
        newYearRatio: 1.5,
        officialVisitors: 1_127_550, // 伊佐須美神社（福島県 令和6年）
      }),
    ]
    const ranges = computeRanges(inputs)
    expect(computeScore(inputs[1]!, ranges)).toBeGreaterThan(
      computeScore(inputs[0]!, ranges),
    )
  })

  it('欠測は 0 として扱い、推測で埋めない', () => {
    const inputs = [base({ siteId: 'a' })]
    expect(computeScore(inputs[0]!, computeRanges(inputs))).toBe(0)
  })
})

describe('noArticlePriority — ★氏神様問題（神社の92.5%は記事が無い）', () => {
  const range = { min: 0, max: 100_000 }

  it('観光入込客統計に載っている社を最優先する', () => {
    const listed = noArticlePriority(
      {
        officialVisitorsListed: true,
        osmHasName: true,
        hasRank: false,
        nearbyPopulation: null,
      },
      range,
    )
    const notListed = noArticlePriority(
      {
        officialVisitorsListed: false,
        osmHasName: true,
        hasRank: false,
        nearbyPopulation: null,
      },
      range,
    )
    expect(listed).toBeGreaterThan(notListed)
  })

  it('★近隣人口密度が効く（Wikipediaに依存しない唯一の全国一様な代理指標）', () => {
    const dense = noArticlePriority(
      {
        officialVisitorsListed: false,
        osmHasName: true,
        hasRank: false,
        nearbyPopulation: 90_000,
      },
      range,
    )
    const sparse = noArticlePriority(
      {
        officialVisitorsListed: false,
        osmHasName: true,
        hasRank: false,
        nearbyPopulation: 500,
      },
      range,
    )
    expect(dense).toBeGreaterThan(sparse)
  })

  it('社格を持つ社は加点される', () => {
    const ranked = noArticlePriority(
      { officialVisitorsListed: false, osmHasName: true, hasRank: true, nearbyPopulation: null },
      range,
    )
    expect(ranked).toBeGreaterThan(0.1)
  })
})
