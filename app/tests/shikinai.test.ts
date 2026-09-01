import { describe, it, expect } from 'vitest'
import {
  parseNote,
  splitNameAndNote,
  parseShikinai,
  describeShikinai,
  isProvinceHeader,
  isDistrictHeader,
  parseProvinceHeader,
} from '@/etl/classical/shikinai'

/**
 * ★以下の社行は zh.wikisource の実本文から採取したもの。
 *   https://zh.wikisource.org/wiki/延喜式/卷第九
 */
const REAL_LINE_1 = '羽束師坐高御産日神社／大。月次新甞。∥'
const REAL_LINE_2 = '乙訓坐大雷神社／名神大。月／次新甞。∥'

describe('splitNameAndNote', () => {
  it('最初の ／ だけを区切りにする', () => {
    expect(splitNameAndNote(REAL_LINE_1)).toEqual({
      name: '羽束師坐高御産日神社',
      note: '大。月次新甞。',
    })
  })

  it('★割注の中に現れる ／ で社名を切ってはいけない', () => {
    const r = splitNameAndNote(REAL_LINE_2)
    expect(r?.name).toBe('乙訓坐大雷神社')
    // 注の中の ／ は残したまま返し、parseNote 側で除去する
    expect(r?.note).toBe('名神大。月／次新甞。')
  })

  it('割注が無い行も社の行として扱う', () => {
    expect(splitNameAndNote('川田神社二座')).toEqual({
      name: '川田神社二座',
      note: '',
    })
  })
})

describe('parseNote', () => {
  it('社格を読む', () => {
    expect(parseNote('大。月次新甞。').rank).toBe('tai')
    expect(parseNote('小。').rank).toBe('sho')
  })

  it('★「名神大」は「大」を含むので先に判定する', () => {
    expect(parseNote('名神大。月／次新甞。').rank).toBe('myojin_tai')
  })

  it('二行割注の ／ を除去してから判定する', () => {
    const r = parseNote('名神大。月／次新甞。')
    expect(r.tsukinami).toBe(true)
    expect(r.niiname).toBe(true)
  })

  it('祭祀を読む（新嘗は旧字「新甞」でも書かれる）', () => {
    const r = parseNote('大。月次新甞。')
    expect(r.tsukinami).toBe(true)
    expect(r.niiname).toBe(true)
    expect(r.ainame).toBe(false)

    expect(parseNote('名神大。月次相甞新甞。').ainame).toBe(true)
    expect(parseNote('名神大。月次相嘗新嘗。').ainame).toBe(true)
  })

  it('官幣・国幣と案上/案下を読む', () => {
    expect(parseNote('名神大。案上官幣。月次新甞。').offering).toBe('kanpei')
    expect(parseNote('名神大。案上官幣。').offeringDetail).toBe('anjo')
    expect(parseNote('大。案下官幣。').offeringDetail).toBe('ange')
    expect(parseNote('小。國幣。').offering).toBe('kokuhei')
    expect(parseNote('小。国幣。').offering).toBe('kokuhei')
  })

  it('座数を読む', () => {
    expect(parseNote('二座。大。月次新甞。').seats).toBe(2)
  })
})

describe('parseShikinai', () => {
  const SAMPLE = [
    '山城國百二十二座大五十三座小六十九座',
    '乙訓郡十九座大五座小十四座',
    REAL_LINE_2,
    '羽束師坐高御産日神社／大。月次新甞。∥',
    '川田神社二座',
    '大和國二百八十六座大百二十八座小百五十八座',
    '添上郡卅七座大十座小廿七座',
    '春日祭神四座／並名神大。月次新甞。∥',
  ].join('\n')

  it('国・郡の見出しを社行に引き継ぐ', () => {
    const r = parseShikinai(SAMPLE)
    const otokuni = r.shrines.find((s) => s.shrineName === '乙訓坐大雷神社')
    expect(otokuni?.province).toBe('山城國')
    expect(otokuni?.district).toBe('乙訓郡')
    expect(otokuni?.rank).toBe('myojin_tai')
  })

  it('国の見出しから座数を読む', () => {
    const h = parseProvinceHeader('山城國百二十二座大五十三座小六十九座')
    expect(h?.province).toBe('山城國')
    expect(h?.totalSeats).toBe(122)
    expect(h?.taiSeats).toBe(53)
    expect(h?.shoSeats).toBe(69)
  })

  it('社名に書かれた座数を拾い、社名からは取り除く', () => {
    const r = parseShikinai(SAMPLE)
    const kawada = r.shrines.find((s) => s.shrineName === '川田神社')
    expect(kawada).toBeDefined()
    expect(kawada?.seats).toBe(2)
  })

  it('座数の記載が無ければ 1 座とする', () => {
    const r = parseShikinai(SAMPLE)
    expect(r.shrines.find((s) => s.shrineName === '羽束師坐高御産日神社')?.seats).toBe(1)
  })

  it('★割注の原文を必ず残す', () => {
    const r = parseShikinai(SAMPLE)
    const s = r.shrines.find((x) => x.shrineName === '乙訓坐大雷神社')
    expect(s?.rawNote).toBe('名神大。月／次新甞。')
    expect(s?.rawLine).toBe(REAL_LINE_2)
  })

  it('国の見出しを社名と誤認しない（座数の記載を要求する）', () => {
    expect(isProvinceHeader('山城國百二十二座大五十三座小六十九座')).toBe(true)
    expect(isProvinceHeader('國造神社')).toBe(false)
    expect(isDistrictHeader('乙訓郡十九座大五座小十四座')).toBe(true)
  })

  it('★欠字・文字化けを検出して残す（黙って直さない）', () => {
    const r = parseShikinai('謎神社／大。〓次新甞。∥\n貞コ神社／小。∥')
    expect(r.shrines[0]?.hasDefect).toBe(true)
    expect(r.shrines[0]?.defects[0]).toContain('欠字')
    expect(r.shrines[1]?.hasDefect).toBe(true)
    expect(r.shrines[1]?.defects[0]).toContain('文字化け')
  })

  it('パースできなかった行は捨てずに残す（黙って落とさない）', () => {
    // 巻頭の「神祇九」のような見出し行は社でも国郡でもない
    const r = parseShikinai('神祇九\n某神社／小。∥')
    expect(r.unparsed).toContain('神祇九')
    expect(r.stats.shrineLines).toBe(1)
  })

  it('統計を返す', () => {
    const r = parseShikinai(SAMPLE)
    expect(r.stats.shrineLines).toBeGreaterThan(0)
    expect(r.stats.rankUnknown).toBeGreaterThanOrEqual(0)
  })
})

describe('describeShikinai — 推測を挟まずに言える事実だけの一文', () => {
  const head = ['山城國百二十二座大五十三座小六十九座', '乙訓郡十九座大五座小十四座']
  const desc = (line: string) =>
    describeShikinai(parseShikinai([...head, line].join('\n')).shrines[0]!)

  it('社格と祭祀から典拠の一文を作る', () => {
    const text = desc(REAL_LINE_2)
    expect(text).toBe(
      '『延喜式』神名帳に、山城國乙訓郡の「名神大社」として記載されている。月次祭・新嘗祭に預かる。',
    )
  })

  it('★「小社社」のような語の重複を作らない', () => {
    const text = desc('角宮神社／小。∥')
    expect(text).toBe('『延喜式』神名帳に、山城國乙訓郡の「小社」として記載されている。')
    expect(text).not.toContain('社社')
  })

  it('相嘗祭・官幣も読める', () => {
    expect(desc('賀茂別雷神社／名神大。案上官幣。月次相甞新甞。∥')).toContain(
      '案上官幣・月次祭・新嘗祭・相嘗祭に預かる。',
    )
  })

  it('2座以上なら座数を添える', () => {
    expect(desc('賀茂御祖神社二座／並名神大。月次新甞。∥')).toContain('2座。')
  })

  it('社格が読めなければ社名で記載の事実だけを述べる', () => {
    const text = describeShikinai(parseShikinai('某神社／∥').shrines[0]!)
    expect(text).toContain('「某神社」として記載されている')
  })

  it('★効果を断定する語を含まない', () => {
    for (const line of [REAL_LINE_1, REAL_LINE_2, '角宮神社／小。∥']) {
      const text = desc(line)
      expect(text).not.toMatch(/効|叶|ご利益|上がり/)
    }
  })
})
