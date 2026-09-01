import { describe, it, expect } from 'vitest'
import {
  resolveEtiquette,
  describeEtiquette,
  denominationRuleFor,
  SHRINE_DEFAULT,
  TEMPLE_DEFAULT,
  ETIQUETTE_DISCLAIMER,
  type EtiquetteOverride,
} from '@/core/etiquette'

describe('既定の作法', () => {
  it('神社は二礼二拍手一礼', () => {
    expect(describeEtiquette(SHRINE_DEFAULT)).toBe('二礼二拍手一礼')
  })

  it('★寺院は拍手を打たない', () => {
    expect(TEMPLE_DEFAULT.clap).toBe(0)
    expect(describeEtiquette(TEMPLE_DEFAULT)).toContain('拍手はしません')
  })

  it('既定値は sourceType: default と明示する', () => {
    expect(SHRINE_DEFAULT.sourceType).toBe('default')
    expect(SHRINE_DEFAULT.sourceUrl).toBeNull()
  })

  it('全ページに出す注記がある', () => {
    expect(ETIQUETTE_DISCLAIMER).toContain('現地の案内表示に従ってください')
  })
})

describe('resolveEtiquette — ★作法は推定してはならない', () => {
  const izumo: EtiquetteOverride = {
    siteKey: 'izumo-taisha',
    name: '出雲大社',
    bowBefore: 2,
    clap: 4,
    bowAfter: 1,
    label: '二礼四拍手一礼',
    sourceUrl: null,
    sourceType: 'pending',
    status: 'PENDING_VERIFICATION',
  }

  it('override が無ければ既定値', () => {
    const r = resolveEtiquette('shrine')
    expect(r.etiquette).toEqual(SHRINE_DEFAULT)
    expect(r.pendingVerification).toBe(false)
  })

  it('★一次情報の出典が無い override は採用しない', () => {
    const r = resolveEtiquette('shrine', izumo)
    // 四拍手を表示せず、既定値のまま
    expect(r.etiquette.clap).toBe(2)
    expect(r.pendingVerification).toBe(true)
  })

  it('公式サイトの出典があれば採用する', () => {
    const verified: EtiquetteOverride = {
      ...izumo,
      sourceUrl: 'https://izumooyashiro.or.jp/guide',
      sourceType: 'official',
      status: 'VERIFIED',
      verifiedAt: '2026-09-01',
    }
    const r = resolveEtiquette('shrine', verified)
    expect(r.etiquette.clap).toBe(4)
    expect(describeEtiquette(r.etiquette)).toBe('二礼四拍手一礼')
    expect(r.etiquette.sourceType).toBe('official')
    expect(r.etiquette.sourceUrl).toBe('https://izumooyashiro.or.jp/guide')
    expect(r.pendingVerification).toBe(false)
  })

  it('sourceType が official でも URL が無ければ採用しない', () => {
    const bad: EtiquetteOverride = { ...izumo, sourceType: 'official', sourceUrl: null }
    expect(resolveEtiquette('shrine', bad).etiquette.clap).toBe(2)
  })
})

describe('denominationRuleFor — 宗派に起因するルール', () => {
  it('★浄土真宗は原則として御朱印を授与しない', () => {
    const r = denominationRuleFor('浄土真宗本願寺派')
    expect(r?.goshuinDefault).toBe('no')
    expect(r?.goshuinNote).toContain('法語印')
  })

  it('★日蓮宗は「御首題」で、御首題帳でないと断られることがある', () => {
    const r = denominationRuleFor('日蓮宗')
    expect(r?.goshuinNote).toContain('御首題')
    expect(r?.goshuinDefault).toBe('unknown')
  })

  it('真宗大谷派も浄土真宗として扱う', () => {
    expect(denominationRuleFor('真宗大谷派')?.denomination).toBe('浄土真宗')
  })

  it('該当しない宗派は null', () => {
    expect(denominationRuleFor('高野山真言宗')).toBeNull()
    expect(denominationRuleFor(null)).toBeNull()
  })
})
