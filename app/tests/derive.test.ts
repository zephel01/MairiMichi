import { describe, it, expect } from 'vitest'
import {
  deriveBenefits,
  applyOfficialOverrides,
  filterForSearch,
  explainDerivation,
  findUnexplainedWishes,
} from '@/core/derive'
import { buildDeityIndex, normalizeDeities } from '@/core/deity'
import type { ExtractedDeity, SiteLore } from '@/core/types'
import { CLUSTERS, CLUSTER_BENEFIT_MAP, TAXONOMY } from './fixtures'

const index = buildDeityIndex(CLUSTERS)
const d = (display: string): ExtractedDeity => ({
  display,
  linkTarget: null,
  role: 'unknown',
  source: 'jawp',
})

function derive(names: string[], includeSecondary = true) {
  const normalized = normalizeDeities(names.map(d), index)
  return deriveBenefits(normalized, CLUSTER_BENEFIT_MAP, TAXONOMY, { includeSecondary })
}

describe('deriveBenefits', () => {
  it('祭神から御利益を導く', () => {
    const r = derive(['菅原道真'])
    const primary = r.filter((b) => b.weight === 'primary').map((b) => b.benefitId)
    expect(primary).toContain('gakugyou_jouju')
    expect(primary).toContain('jyuken_goukaku')
  })

  it('★導出根拠を必ず持つ（F-02）', () => {
    const r = derive(['菅原道真'])
    expect(r.every((b) => b.derivedFromDeity !== null)).toBe(true)
    expect(r[0]?.derivedFromCluster).toBe('tenjin')
    expect(r[0]?.confidence).toBe('derived')
  })

  it('大分類を必ず解決する', () => {
    const r = derive(['稲荷神'])
    expect(r.find((b) => b.benefitId === 'shoubai_hanjou')?.majorId).toBe('shoubai')
    expect(r.find((b) => b.benefitId === 'gokoku_houjou')?.majorId).toBe('nariwai')
  })

  it('複数祭神は常態。重複は primary に昇格させて1件にまとめる', () => {
    // 稲荷（secondary: kanai_anzen）＋ 八幡（secondary: kanai_anzen）
    const r = derive(['稲荷神', '八幡神'])
    const kanai = r.filter((b) => b.benefitId === 'kanai_anzen')
    expect(kanai).toHaveLength(1)
  })

  it('secondary で出たものが別の祭神で primary なら primary に昇格する', () => {
    // スサノオは gokoku_houjou が secondary、金山彦は primary
    const r = derive(['素戔嗚尊', '金山彦命'])
    expect(r.find((b) => b.benefitId === 'gokoku_houjou')?.weight).toBe('primary')
  })

  it('★人物神は定型マッピングが無いので何も出さない（400社中72社=18%）', () => {
    expect(derive(['織田信長'])).toHaveLength(0)
    expect(derive(['徳川家康'])).toHaveLength(0)
  })

  it('★阿弥陀如来は現世利益に落ちないので何も出さない（寺院の約4割）', () => {
    expect(derive(['阿弥陀如来'])).toHaveLength(0)
  })

  it('薬師如来は病気平癒が primary', () => {
    const r = derive(['薬師如来'])
    expect(r.find((b) => b.benefitId === 'byouki_heiyu')?.weight).toBe('primary')
  })

  it('同定できない祭神からは何も出さない', () => {
    expect(derive(['彦火明命'])).toHaveLength(0)
  })
})

describe('filterForSearch — ★1寺社10タグ問題への対策', () => {
  it('既定では primary のみを検索対象にする', () => {
    const all = derive(['稲荷神'])
    const searchable = filterForSearch(all)
    expect(all.length).toBeGreaterThan(searchable.length)
    expect(searchable.every((b) => b.weight === 'primary')).toBe(true)
    expect(searchable).toHaveLength(2) // 商売繁盛・五穀豊穣
  })

  it('「関連する御利益も含める」トグルで secondary を開放する', () => {
    const all = derive(['稲荷神'])
    expect(filterForSearch(all, true)).toHaveLength(all.length)
  })

  it('★素直に全部付けると「全社寺が全カテゴリ」になることを示す', () => {
    // 主要4祭神を持つ社を想定
    const all = derive(['稲荷神', '八幡神', '天照大神', '素戔嗚尊'])
    const majors = new Set(all.map((b) => b.majorId))
    // secondary まで含めると多数の大分類にまたがってしまう
    expect(majors.size).toBeGreaterThanOrEqual(5)
    // primary に絞れば意味のある数に収まる
    const primaryMajors = new Set(filterForSearch(all).map((b) => b.majorId))
    expect(primaryMajors.size).toBeLessThan(majors.size)
  })
})

describe('applyOfficialOverrides', () => {
  const lore: SiteLore[] = [
    {
      benefitId: 'enmusubi_love',
      text: '古くから縁結びの社として信仰されています。',
      sourceType: 'official',
      sourceUrl: 'https://example.jinja.jp/about',
      sourceName: '◯◯神社 公式サイト',
    },
  ]

  it('公式情報は derived より優先し、confidence を official にする', () => {
    const r = applyOfficialOverrides(derive(['稲荷神']), lore, TAXONOMY)
    const e = r.find((b) => b.benefitId === 'enmusubi_love')
    expect(e?.confidence).toBe('official')
    expect(e?.weight).toBe('primary')
    expect(e?.sourceUrl).toBe('https://example.jinja.jp/about')
  })

  it('★出典URLが無い言説は受け付けない', () => {
    const bad = [{ ...lore[0]!, sourceUrl: '' }]
    const r = applyOfficialOverrides(derive(['稲荷神']), bad, TAXONOMY)
    expect(r.find((b) => b.benefitId === 'enmusubi_love')).toBeUndefined()
  })
})

describe('explainDerivation — ★断定しない表現', () => {
  it('推定は「祭神・本尊にもとづく推定」と明示する', () => {
    const r = derive(['菅原道真'])
    const text = explainDerivation(r[0]!, TAXONOMY)
    expect(text).toContain('菅原道真')
    expect(text).toContain('推定')
  })

  it('効果を断定する語を含まない', () => {
    for (const b of derive(['稲荷神', '八幡神'])) {
      const text = explainDerivation(b, TAXONOMY)
      expect(text).not.toMatch(/効きます|効果があります|叶います|上がります/)
    }
  })

  it('公式記載は出典があることを述べる', () => {
    const r = applyOfficialOverrides(
      derive(['稲荷神']),
      [
        {
          benefitId: 'enmusubi_love',
          text: 'x',
          sourceType: 'official',
          sourceUrl: 'https://example.jinja.jp/',
          sourceName: 'y',
        },
      ],
      TAXONOMY,
    )
    const e = r.find((b) => b.benefitId === 'enmusubi_love')!
    expect(explainDerivation(e, TAXONOMY)).toContain('公式情報に記載')
  })
})

describe('findUnexplainedWishes — 祭神では説明できない信仰実態', () => {
  it('★導出されていないのに願われている御利益を検出する', () => {
    // 八幡系の社だが、実際には縁切りで参られている、というケース
    const derived = derive(['八幡神'])
    const wishes = new Map([
      ['enkiri', 12],
      ['yakuyoke_only', 30],
    ])
    expect(findUnexplainedWishes(derived, wishes)).toEqual(['enkiri'])
  })

  it('件数が少ないものは拾わない', () => {
    const derived = derive(['八幡神'])
    expect(findUnexplainedWishes(derived, new Map([['enkiri', 1]]))).toEqual([])
  })
})
