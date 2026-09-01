import { describe, it, expect } from 'vitest'
import { detectGaps, renderGapsMarkdown, regionOf, DEFAULT_GAP_OPTIONS } from '@/etl/gaps'
import type { Site } from '@/core/types'
import { SHRINE_DEFAULT } from '@/core/etiquette'
import { ALL_MAJORS } from './fixtures'

function site(o: Partial<Site> & { id: string; prefectureCode: string }): Site {
  return {
    name: o.id,
    type: 'shrine',
    lat: 35,
    lng: 135,
    deities: [],
    benefits: [],
    etiquette: SHRINE_DEFAULT,
    citations: [],
    lore: [],
    groups: [],
    dataQuality: {
      benefit: false,
      etiquette: false,
      goshuin: false,
      access: false,
      citation: false,
    },
    ...o,
  }
}

describe('regionOf', () => {
  it('都道府県コードから8地方区分を引く', () => {
    expect(regionOf('13')).toBe('関東')
    expect(regionOf('26')).toBe('近畿')
    expect(regionOf('38')).toBe('四国')
    expect(regionOf('99')).toBeNull()
  })
})

describe('detectGaps — 穴は主観ではなくクエリの結果で決める', () => {
  it('地理の穴: 収録が少ない都道府県を検出する', () => {
    const gaps = detectGaps([site({ id: 'a', prefectureCode: '13' })], ALL_MAJORS)
    const shimane = gaps.find((g) => g.kind === 'geography' && g.region === '32')
    expect(shimane).toBeDefined()
    expect(shimane?.count).toBe(0)
  })

  it('★御利益の穴: 地方 × 大分類 で0件を検出する', () => {
    const gaps = detectGaps([], ALL_MAJORS)
    const shikokuAnzan = gaps.find(
      (g) => g.kind === 'benefit' && g.region === '四国' && g.benefitMajorId === 'anzan',
    )
    expect(shikokuAnzan).toBeDefined()
    expect(shikokuAnzan?.description).toContain('四国')
  })

  it('★アクセスの穴: 「車なしで行ける」が0件の地方を検出する', () => {
    const sites = [
      site({
        id: 'a',
        prefectureCode: '13',
        access: {
          accessMode: 'CAR_ONLY',
          walkLoad: 'HARD',
          nearestStation: null,
          nearestBusStop: null,
          walkDistanceM: null,
          walkMinutes: null,
          ascentM: null,
          descentM: null,
          reliefAroundM: null,
          reason: 'test',
          computedAt: '2026-09-01T00:00:00Z',
        },
      }),
    ]
    const gaps = detectGaps(sites, ALL_MAJORS)
    const kanto = gaps.find((g) => g.kind === 'access' && g.region === '関東')
    expect(kanto?.count).toBe(0)
  })

  it('★巡礼の穴: 構成社が欠けたグループを検出する（めぐりコースが成立しない）', () => {
    const gaps = detectGaps([], ALL_MAJORS, [
      { groupId: 'shikoku88', name: '四国八十八箇所', totalCount: 88, registered: 62 },
    ])
    const g = gaps.find((x) => x.kind === 'pilgrimage')
    expect(g?.description).toContain('62/88')
    expect(g?.description).toContain('めぐりコース')
  })

  it('巡礼が揃っていれば穴として出さない', () => {
    const gaps = detectGaps([], ALL_MAJORS, [
      { groupId: 'g', name: '七福神', totalCount: 7, registered: 7 },
    ])
    expect(gaps.filter((g) => g.kind === 'pilgrimage')).toHaveLength(0)
  })

  it('★作法の穴: PENDING_VERIFICATION が残っていることを検出する', () => {
    const sites = [
      site({
        id: '出雲大社',
        prefectureCode: '32',
        etiquette: {
          ...SHRINE_DEFAULT,
          sourceType: 'pending',
          label: '二礼四拍手一礼',
        },
      }),
    ]
    const gaps = detectGaps(sites, ALL_MAJORS)
    const e = gaps.find((g) => g.kind === 'etiquette')
    expect(e?.description).toContain('出雲大社')
  })

  it('閾値を満たしていれば穴として出さない', () => {
    const sites = Array.from({ length: 5 }, (_, i) =>
      site({ id: `t${i}`, prefectureCode: '13' }),
    )
    const gaps = detectGaps(sites, ALL_MAJORS, [], DEFAULT_GAP_OPTIONS)
    expect(gaps.find((g) => g.kind === 'geography' && g.region === '13')).toBeUndefined()
  })
})

describe('renderGapsMarkdown', () => {
  it('次の収録キューとして読める Markdown を出す', () => {
    const gaps = detectGaps([], ALL_MAJORS, [
      { groupId: 'shikoku88', name: '四国八十八箇所', totalCount: 88, registered: 0 },
    ])
    const md = renderGapsMarkdown(gaps, new Date('2026-09-01T00:00:00Z'))
    expect(md).toContain('# MairiMichi 穴の検出結果 2026-09-01')
    expect(md).toContain('そのまま次の収録キューになります')
    expect(md).toContain('## 地理の穴')
    expect(md).toContain('## 巡礼の穴')
  })

  it('穴が無ければその旨を書く', () => {
    expect(renderGapsMarkdown([])).toContain('穴は検出されませんでした')
  })
})
