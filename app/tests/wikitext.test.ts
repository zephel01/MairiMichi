import { describe, it, expect } from 'vitest'
import {
  extractShrineDeities,
  extractTempleInfo,
  extractInfoboxParam,
  splitEntries,
  parseDeityEntry,
  stripAnnotations,
} from '@/etl/wikitext'

/**
 * ★以下の infobox はすべて ja.Wikipedia の実データから採取したもの。
 *   調査で神社400記事・寺院160記事を実取得して集計した揺れの実例。
 */

const ITSUKUSHIMA = `{{神社
|名称 = 厳島神社
|所在地 = 広島県廿日市市宮島町1-1
|祭神 = [[イチキシマヒメ|市杵島姫命]]<br />[[田心姫命]]<br />[[湍津姫命]]
|社格 = 式内社（名神大）
}}`

const NIKKO_TOSHOGU = `{{神社
|名称 = 日光東照宮
|祭神 = [[東照大権現]]（[[徳川家康]]）<br/>（相殿）[[豊臣秀吉]]・[[源頼朝]]
}}`

const SUMIYOSHI = `{{神社
|名称 = 住吉大社
|祭神 = [[住吉三神|底筒男命]]<br />[[住吉三神|中筒男命]]<br />[[神功皇后]]<!--住吉大社での公式表記で記載-->
}}`

const FUSHIMI_INARI = `{{神社
|名称 = 伏見稲荷大社
|祭神 = [[稲荷神|稲荷大神]]<br />（[[ウカノミタマ|宇迦之御魂大神]]ほか4柱の総称）
}}`

const KENKUN = `{{神社
|名称 = 建勲神社
|祭神 = [[織田信長]]公、[[織田信忠]]卿
}}`

// リンクなしの素テキスト（実測 40.7%）
const KONO = `{{神社
|名称 = 籠神社
|祭神 = 彦火明命
}}`

// Wikidata へ委譲している記事（例: 伊勢神明社(静岡市)）
const DELEGATED = `{{神社
|名称 = 伊勢神明社
|祭神 = {{wikidata|property|references|Q11405190|P825}}
}}`

const KONGOBUJI = `{{日本の寺院
|名称 = 金剛峯寺
|宗派 = 高野山真言宗
|本尊 = [[薬師如来]]（[[阿閦如来]]とも）{{efn|諸説ある}}
|札所等 = 西国三十三所番外
}}`

const CHIONIN = `{{日本の寺院
|名称 = 知恩院
|宗派 = 浄土宗
|本尊 = [[法然]]上人像（御影堂）<br />[[阿弥陀如来]]（阿弥陀堂）
}}`

describe('extractInfoboxParam', () => {
  it('★パラメータ名は「主祭神」ではなく「祭神」', () => {
    expect(extractInfoboxParam(ITSUKUSHIMA, ['神社'], '祭神')).toBeTruthy()
    expect(extractInfoboxParam(ITSUKUSHIMA, ['神社'], '主祭神')).toBeNull()
  })

  it('次のパラメータまでで切る', () => {
    const v = extractInfoboxParam(ITSUKUSHIMA, ['神社'], '所在地')
    expect(v).toBe('広島県廿日市市宮島町1-1')
  })

  it('入れ子のリンク・テンプレートを跨いで取る', () => {
    const v = extractInfoboxParam(KONGOBUJI, ['日本の寺院'], '本尊')
    expect(v).toContain('薬師如来')
    expect(v).toContain('{{efn|諸説ある}}')
  })
})

describe('stripAnnotations', () => {
  it('HTMLコメントと efn を落とす', () => {
    expect(stripAnnotations('A<!--コメント-->B')).toBe('AB')
    expect(stripAnnotations('A{{efn|注}}B')).toBe('AB')
    expect(stripAnnotations('A<ref>出典</ref>B')).toBe('AB')
  })
})

describe('splitEntries', () => {
  it('<br /> と <br> の両方で切る', () => {
    expect(splitEntries('A<br />B<br>C')).toEqual(['A', 'B', 'C'])
  })

  it('リンクとリンクの間の中黒で切る', () => {
    expect(splitEntries('[[豊臣秀吉]]・[[源頼朝]]')).toEqual(['[[豊臣秀吉]]', '[[源頼朝]]'])
  })

  it('名前の中の中黒では切らない', () => {
    expect(splitEntries('八幡・住吉')).toEqual(['八幡・住吉'])
  })
})

describe('parseDeityEntry', () => {
  it('★パイプリンクは「表示名」ではなく「リンク先記事名」を返す', () => {
    // これが表示名の揺れ 41.2% を無料で吸収する
    const r = parseDeityEntry('[[イチキシマヒメ|市杵島姫命]]')
    expect(r?.linkTarget).toBe('イチキシマヒメ')
    expect(r?.display).toBe('市杵島姫命')
  })

  it('リンクなしの素テキストも拾う（実測 40.7%）', () => {
    const r = parseDeityEntry('彦火明命')
    expect(r?.display).toBe('彦火明命')
    expect(r?.linkTarget).toBeNull()
  })

  it('{{wikidata}} 委譲は null を返し、Wikidata 側から取らせる', () => {
    expect(parseDeityEntry('{{wikidata|property|references|Q11405190|P825}}')).toBeNull()
  })

  it('「ほか◯柱」のような曖昧表現は祭神名にしない', () => {
    expect(parseDeityEntry('ほか4柱の総称')).toBeNull()
  })
})

describe('extractShrineDeities — 実データ', () => {
  it('厳島神社: 3柱を取る', () => {
    const r = extractShrineDeities(ITSUKUSHIMA)
    expect(r.deities.map((d) => d.linkTarget)).toEqual([
      'イチキシマヒメ',
      '田心姫命',
      '湍津姫命',
    ])
  })

  it('日光東照宮: 中黒区切りと相殿を扱う', () => {
    const r = extractShrineDeities(NIKKO_TOSHOGU)
    const targets = r.deities.map((d) => d.linkTarget)
    expect(targets).toContain('東照大権現')
    expect(targets).toContain('豊臣秀吉')
    expect(targets).toContain('源頼朝')
    // ★相殿の語は検出するが、主祭神との分離は保証しない
    expect(r.hasAidonoMarker).toBe(true)
    expect(r.deities.every((d) => d.role === 'unknown')).toBe(true)
  })

  it('住吉大社: HTMLコメントを落とす', () => {
    const r = extractShrineDeities(SUMIYOSHI)
    expect(r.deities.map((d) => d.linkTarget)).toContain('神功皇后')
    expect(r.deities.some((d) => d.display.includes('<!--'))).toBe(false)
  })

  it('伏見稲荷大社: 括弧内のリンクも拾う', () => {
    const r = extractShrineDeities(FUSHIMI_INARI)
    const targets = r.deities.map((d) => d.linkTarget)
    expect(targets).toContain('稲荷神')
    expect(targets).toContain('ウカノミタマ')
  })

  it('建勲神社: 読点区切りの人物神', () => {
    const r = extractShrineDeities(KENKUN)
    expect(r.deities.map((d) => d.linkTarget)).toEqual(['織田信長', '織田信忠'])
  })

  it('籠神社: リンクなしの素テキスト', () => {
    const r = extractShrineDeities(KONO)
    expect(r.deities[0]?.display).toBe('彦火明命')
    expect(r.deities[0]?.linkTarget).toBeNull()
  })

  it('Wikidata 委譲を検出する', () => {
    const r = extractShrineDeities(DELEGATED)
    expect(r.delegatedToWikidata).toBe(true)
    expect(r.deities).toHaveLength(0)
  })

  it('祭神パラメータが無ければ raw は null', () => {
    expect(extractShrineDeities('{{神社|名称=某}}').raw).toBeNull()
  })
})

describe('extractTempleInfo — 実データ', () => {
  it('★Template:日本の寺院 には「本尊」パラメータがある', () => {
    const r = extractTempleInfo(KONGOBUJI)
    expect(r.honzon.map((d) => d.linkTarget)).toContain('薬師如来')
    expect(r.denomination).toBe('高野山真言宗')
  })

  it('札所等を取る（巡礼グループの素材）', () => {
    expect(extractTempleInfo(KONGOBUJI).fudasho).toBe('西国三十三所番外')
  })

  it('知恩院: 堂宇別の複数本尊', () => {
    const r = extractTempleInfo(CHIONIN)
    const targets = r.honzon.map((d) => d.linkTarget)
    expect(targets).toContain('法然')
    expect(targets).toContain('阿弥陀如来')
    expect(r.denomination).toBe('浄土宗')
  })
})
