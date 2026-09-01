import { describe, it, expect } from 'vitest'
import { parseKansuji, parseSeats, hasDefect } from '@/etl/classical/kansuji'

describe('parseKansuji', () => {
  it('一桁', () => {
    expect(parseKansuji('一')).toBe(1)
    expect(parseKansuji('九')).toBe(9)
    expect(parseKansuji('〇')).toBe(0)
  })

  it('十の位', () => {
    expect(parseKansuji('十')).toBe(10)
    expect(parseKansuji('十九')).toBe(19)
    expect(parseKansuji('五十三')).toBe(53)
    expect(parseKansuji('六十九')).toBe(69)
  })

  it('百・千の位', () => {
    expect(parseKansuji('百二十二')).toBe(122)
    expect(parseKansuji('四百九十二')).toBe(492)
    expect(parseKansuji('二千八百六十一')).toBe(2861)
    expect(parseKansuji('三千一百三十二')).toBe(3132)
  })

  it('大字（延喜式の実文にも出る）', () => {
    // 出雲国風土記「合神社參佰玖拾玖所」
    expect(parseKansuji('參佰玖拾玖')).toBe(399)
    expect(parseKansuji('壹佰捌拾肆')).toBe(184)
    expect(parseKansuji('貳佰壹拾伍')).toBe(215)
  })

  it('★欠字を含む数値は推測で埋めず null を返す', () => {
    // 神名帳冒頭の実文「天神地祇惣三千一百〓二座」
    expect(parseKansuji('三千一百〓二')).toBeNull()
    expect(parseKansuji('二千六百〓')).toBeNull()
    expect(parseKansuji('■十')).toBeNull()
  })

  it('想定外の文字が混ざったら黙って無視せず null', () => {
    expect(parseKansuji('五十あ三')).toBeNull()
    expect(parseKansuji('')).toBeNull()
  })

  it('アラビア数字も許容する', () => {
    expect(parseKansuji('122')).toBe(122)
  })
})

describe('parseSeats', () => {
  it('「◯◯座」から座数を取る', () => {
    expect(parseSeats('川田神社二座')).toBe(2)
    expect(parseSeats('乙訓郡十九座大五座小十四座')).toBe(19)
  })

  it('座の記載が無ければ null', () => {
    expect(parseSeats('羽束師坐高御産日神社')).toBeNull()
  })

  it('欠字を含む座数は null', () => {
    expect(parseSeats('二千六百〓座')).toBeNull()
  })
})

describe('hasDefect', () => {
  it('欠字マーカーを検出する', () => {
    expect(hasDefect('天神地祇惣三千一百〓二座')).toBe(true)
    expect(hasDefect('■')).toBe(true)
    expect(hasDefect('乙訓坐大雷神社')).toBe(false)
  })
})
