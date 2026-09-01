import { describe, it, expect } from 'vitest'
import {
  buildDeityIndex,
  normalizeDeity,
  normalizeDeities,
  normalizeDeityName,
  identificationRate,
} from '@/core/deity'
import type { ExtractedDeity } from '@/core/types'
import { CLUSTERS } from './fixtures'

const index = buildDeityIndex(CLUSTERS)

const d = (display: string, linkTarget: string | null = null): ExtractedDeity => ({
  display,
  linkTarget,
  role: 'unknown',
  source: 'jawp',
})

describe('normalizeDeityName', () => {
  it('敬称語尾を落とす', () => {
    expect(normalizeDeityName('大国主命')).toBe(normalizeDeityName('大国主'))
    expect(normalizeDeityName('天照大御神')).toBe(normalizeDeityName('天照'))
  })

  it('★実測で最多だった表記ゆれを吸収する', () => {
    // 「天照皇大神」/「天照大神」
    expect(normalizeDeityName('天照皇大神')).toBe('天照皇')
    expect(normalizeDeityName('天照大神')).toBe('天照')
    // 「素盞鳴命」/「素戔嗚尊」
    expect(normalizeDeityName('素盞鳴命')).toBe(normalizeDeityName('素戔嗚尊'))
    // 「金山毘古命」/「金山彦命」
    expect(normalizeDeityName('金山毘古命')).toBe(normalizeDeityName('金山彦命'))
  })

  it('括弧注記・空白・中黒を落とす', () => {
    expect(normalizeDeityName('大国主（大己貴）')).toBe('大国主')
    expect(normalizeDeityName('底 筒 男 命')).toBe('底筒男')
  })

  it('全部消える語尾は落とさない', () => {
    expect(normalizeDeityName('命')).toBe('命')
  })
})

describe('normalizeDeity — 突合の優先順', () => {
  it('1) QID 完全一致が最優先', () => {
    const r = normalizeDeity(d('よくわからない名前'), index, 'Q261637')
    expect(r.clusterId).toBe('hachiman')
    expect(r.matchedBy).toBe('qid')
  })

  it('★分裂した QID を同じクラスタに寄せる', () => {
    // 八幡神 Q261637 ⇔ 応神天皇 Q317997
    expect(normalizeDeity(d('八幡神'), index, 'Q261637').clusterId).toBe('hachiman')
    expect(normalizeDeity(d('応神天皇'), index, 'Q317997').clusterId).toBe('hachiman')
    // 稲荷神 Q719665 ⇔ ウカノミタマ Q3080728
    expect(normalizeDeity(d('稲荷神'), index, 'Q719665').clusterId).toBe('inari')
    expect(normalizeDeity(d('宇迦之御魂神'), index, 'Q3080728').clusterId).toBe('inari')
    // 天満大自在天神 Q1753428 ⇔ 菅原道真 Q382005
    expect(normalizeDeity(d('天満大自在天神'), index, 'Q1753428').clusterId).toBe('tenjin')
    expect(normalizeDeity(d('菅原道真'), index, 'Q382005').clusterId).toBe('tenjin')
    // 素戔嗚尊 Q272993 ⇔ 牛頭天王 Q11570247（習合）
    expect(normalizeDeity(d('素戔嗚尊'), index, 'Q272993').clusterId).toBe('susanoo')
    expect(normalizeDeity(d('牛頭天王'), index, 'Q11570247').clusterId).toBe('susanoo')
  })

  it('2) ★リンク先記事名を表示名より優先する', () => {
    // [[イチキシマヒメ|市杵島姫命]] は表示名が揺れてもリンク先で当たる
    const r = normalizeDeity(d('市杵島姫命', 'イチキシマヒメ'), index)
    expect(r.clusterId).toBe('munakata')
    expect(r.matchedBy).toBe('linkTarget')
  })

  it('3) リンクが無ければ別名辞書であいまい一致（実測 40.7% がこれ）', () => {
    const r = normalizeDeity(d('素盞鳴命'), index)
    expect(r.clusterId).toBe('susanoo')
    expect(r.matchedBy).toBe('alias')
  })

  it('4) ★一致しなければ推測せず null', () => {
    // 純ローカル神（式内社の土地神）。全国的な御利益言説がない
    const r = normalizeDeity(d('彦火明命'), index)
    expect(r.clusterId).toBeNull()
    expect(r.matchedBy).toBeNull()
  })
})

describe('identificationRate', () => {
  it('同定率を返す（データ品質の可視化に使う）', () => {
    const normalized = normalizeDeities(
      [d('稲荷神'), d('彦火明命'), d('菅原道真'), d('若宇加能売命')],
      index,
    )
    expect(identificationRate(normalized)).toBe(0.5)
  })

  it('空なら 0', () => {
    expect(identificationRate([])).toBe(0)
  })
})
