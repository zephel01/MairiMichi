import { describe, it, expect } from 'vitest'
import { loadMasterData, MasterDataError, renderIssues } from '@/data/loaders'
import { loadMasterDataFromFs, readRawSources } from '@/data/load-from-fs'
import { buildDeityIndex, normalizeDeities } from '@/core/deity'
import { deriveBenefits, filterForSearch } from '@/core/derive'
import type { ExtractedDeity } from '@/core/types'

/**
 * ★このテストは実際の data/*.yaml を読む。
 *   YAML のタイプミス1文字で導出が静かに壊れるのを、ここで止める。
 */
describe('実際のマスタデータ', () => {
  const master = loadMasterDataFromFs()

  it('エラーなく読み込める（エラーがあれば例外で落ちる）', () => {
    expect(master.majors.length).toBe(10)
    expect(master.clusters.length).toBeGreaterThan(30)
    expect(master.clusterBenefits.size).toBeGreaterThan(30)
  })

  it('大分類10がすべて揃っている', () => {
    const ids = master.majors.map((m) => m.id).sort()
    expect(ids).toEqual(
      [
        'anzan',
        'enmusubi',
        'gakugyou',
        'kanai',
        'kenkou',
        'koutsuu',
        'nariwai',
        'shoubai',
        'shoubu',
        'yakuyoke',
      ].sort(),
    )
  })

  it('ユーザー提示の8分類が大分類に含まれている', () => {
    const labels = master.majors.map((m) => m.label)
    expect(labels).toContain('縁結び・恋愛・夫婦')
    expect(labels).toContain('商売繁盛・金運')
    expect(labels).toContain('学業・合格')
    expect(labels).toContain('健康・平癒')
    expect(labels).toContain('厄除け・開運')
    expect(labels).toContain('安産・子授け・子育て')
    expect(labels).toContain('交通安全')
    expect(labels).toContain('勝負・出世')
  })

  it('追加した2分類には根拠が書かれている', () => {
    const kanai = master.majors.find((m) => m.id === 'kanai')
    const nariwai = master.majors.find((m) => m.id === 'nariwai')
    expect(kanai?.addedReason).toContain('3,710')
    expect(nariwai?.addedReason).toContain('4,276')
  })

  it('★cluster_benefits の御利益IDがすべて benefits.yaml に存在する', () => {
    // loadMasterData が error を投げないこと自体がこの検証だが、明示的に確認する
    for (const cb of master.clusterBenefits.values()) {
      for (const b of [...cb.primary, ...cb.secondary]) {
        expect(master.taxonomy.majorOf.has(b)).toBe(true)
      }
    }
  })

  it('★cluster_benefits のクラスタがすべて deity_clusters に存在する', () => {
    const ids = new Set(master.clusters.map((c) => c.id))
    for (const cb of master.clusterBenefits.values()) {
      expect(ids.has(cb.cluster)).toBe(true)
    }
  })

  it('人物神・阿弥陀・釈迦には policy が設定されている', () => {
    expect(master.clusterBenefits.get('jinbutsu_shin')?.policy).toBe('NO_AUTO_MAPPING')
    expect(master.clusterBenefits.get('amida')?.policy).toBe('NO_CURRENT_BENEFIT')
    expect(master.clusterBenefits.get('shaka')?.policy).toBe('NO_CURRENT_BENEFIT')
  })

  it('★作法の override は全件 pending（一次情報の裏取りが未了）', () => {
    const pending = [...master.etiquetteOverrides.values()].filter(
      (o) => o.status === 'PENDING_VERIFICATION',
    )
    expect(pending.length).toBeGreaterThan(0)
    // 出典が無いので official は1件も無いはず
    expect(
      [...master.etiquetteOverrides.values()].filter((o) => o.sourceType === 'official'),
    ).toHaveLength(0)
  })

  it('宗派ルール（浄土真宗・日蓮宗）が読める', () => {
    const names = master.denominationRules.map((r) => r.denomination)
    expect(names).toContain('浄土真宗')
    expect(names).toContain('日蓮宗')
  })

  it('巡礼グループが読める', () => {
    const ids = master.pilgrimages.map((p) => p.id)
    expect(ids).toContain('shikoku88')
    expect(master.pilgrimages.find((p) => p.id === 'shikoku88')?.totalCount).toBe(88)
  })

  it('検証結果を人が読める形で出せる', () => {
    const text = renderIssues(master.issues)
    expect(text).toContain('マスタデータの検証')
  })
})

describe('実マスタで実際に導出できる', () => {
  const master = loadMasterDataFromFs()
  const index = buildDeityIndex(master.clusters)

  const derive = (names: string[]) => {
    const deities: ExtractedDeity[] = names.map((display) => ({
      display,
      linkTarget: null,
      role: 'unknown',
      source: 'jawp',
    }))
    return deriveBenefits(
      normalizeDeities(deities, index),
      master.clusterBenefits,
      master.taxonomy,
    )
  }

  it('稲荷神 → 商売繁盛・五穀豊穣', () => {
    const primary = filterForSearch(derive(['稲荷神'])).map((b) => b.benefitId)
    expect(primary).toContain('shoubai_hanjou')
    expect(primary).toContain('gokoku_houjou')
  })

  it('菅原道真 → 学業成就・受験合格', () => {
    const primary = filterForSearch(derive(['菅原道真'])).map((b) => b.benefitId)
    expect(primary).toContain('gakugyou_jouju')
  })

  it('木花咲耶姫命 → 安産・子授け', () => {
    const primary = filterForSearch(derive(['木花咲耶姫命'])).map((b) => b.benefitId)
    expect(primary).toContain('anzan_only')
  })

  it('愛宕権現 → 火除け', () => {
    const primary = filterForSearch(derive(['愛宕権現'])).map((b) => b.benefitId)
    expect(primary).toContain('hiyoke')
  })

  it('住吉三神 → 海上安全', () => {
    const primary = filterForSearch(derive(['住吉三神'])).map((b) => b.benefitId)
    expect(primary).toContain('kaijou_anzen')
  })

  it('★織田信長（人物神）からは何も導出しない', () => {
    expect(derive(['織田信長'])).toHaveLength(0)
  })

  it('★阿弥陀如来からは何も導出しない（現世利益に落ちない）', () => {
    expect(derive(['阿弥陀如来'])).toHaveLength(0)
  })

  it('薬師如来 → 病気平癒', () => {
    expect(filterForSearch(derive(['薬師如来'])).map((b) => b.benefitId)).toContain(
      'byouki_heiyu',
    )
  })

  it('★同定できない純ローカル神からは何も導出しない', () => {
    expect(derive(['若宇加能売命'])).toHaveLength(0)
  })
})

describe('検証が壊れたデータを止める', () => {
  const src = readRawSources()

  it('★存在しない御利益IDを指していたらエラーで落とす（タイプミス1文字）', () => {
    // shoubai_hanjou の "u" が抜けただけ。これを通すと
    // 「稲荷神なのに商売繁盛が付かない」が警告も無く起きる
    const broken = {
      ...src,
      clusterBenefits:
        src.clusterBenefits + '\n  - cluster: hakusan\n    primary: [shoubai_hanjo]\n',
    }
    try {
      loadMasterData(broken)
      expect.unreachable('検証が通ってしまった')
    } catch (e) {
      expect(e).toBeInstanceOf(MasterDataError)
      expect((e as MasterDataError).message).toContain('shoubai_hanjo')
      expect((e as MasterDataError).message).toContain('benefits.yaml に存在しません')
    }
  })

  it('存在しないクラスタを指していたらエラーで落とす', () => {
    const broken = {
      ...src,
      clusterBenefits: src.clusterBenefits + '\n  - cluster: nonexistent\n    primary: [kaiun]\n',
    }
    expect(() => loadMasterData(broken)).toThrow(MasterDataError)
  })

  it('エラーの中身が何を直せばよいか示している', () => {
    const broken = {
      ...src,
      clusterBenefits: src.clusterBenefits + '\n  - cluster: typo_cluster\n    primary: [kaiun]\n',
    }
    try {
      loadMasterData(broken)
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(MasterDataError)
      const err = e as MasterDataError
      expect(err.message).toContain('typo_cluster')
      expect(err.message).toContain('deity_clusters.yaml に存在しません')
    }
  })
})
