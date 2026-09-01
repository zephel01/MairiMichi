import { describe, it, expect } from 'vitest'
import {
  assessAccess,
  assessAccessMode,
  assessWalkLoad,
  isReachableWithoutCar,
  ACCESS_SORT_ORDER,
  DEFAULT_THRESHOLDS,
} from '@/core/access'
import type { AccessInput } from '@/core/access'
import type { AccessMode, BusStopRef, StationRef } from '@/core/types'

const station = (walkMin: number): StationRef => ({
  name: 'JR◯◯駅',
  lineName: '◯◯線',
  distanceM: walkMin * 80,
  walkMin,
})

const bus = (
  walkMin: number,
  tripsWeekday: number | null,
  connectsToStation = true,
): BusStopRef => ({
  name: '△△',
  operator: '◯◯バス',
  distanceM: walkMin * 80,
  walkMin,
  tripsWeekday,
  tripsSat: tripsWeekday,
  tripsSun: tripsWeekday,
  connectsToStation,
  unknownReason:
    tripsWeekday === null
      ? 'バス停「△△」はありますが、この地域のバス運行データが公開されていないため便数を確認できません。'
      : undefined,
})

const input = (o: Partial<AccessInput> = {}): AccessInput => ({
  nearestStation: null,
  nearestBusStop: null,
  walkDistanceM: null,
  walkMinutes: null,
  ascentM: null,
  descentM: null,
  reliefAroundM: null,
  ...o,
})

describe('assessAccessMode', () => {
  it('駅から徒歩圏なら TRAIN_ONLY', () => {
    const r = assessAccessMode(input({ nearestStation: station(12), walkMinutes: 12 }))
    expect(r.mode).toBe('TRAIN_ONLY')
    expect(r.reason).toContain('徒歩12分')
  })

  it('バス便が十分あれば TRAIN_BUS', () => {
    const r = assessAccessMode(
      input({ nearestStation: station(60), nearestBusStop: bus(8, 18), walkMinutes: 8 }),
    )
    expect(r.mode).toBe('TRAIN_BUS')
    expect(r.reason).toContain('平日18本/日')
  })

  it('★GTFS未整備でバス便数が不明なら UNKNOWN（車必須と誤判定しない）', () => {
    const r = assessAccessMode(input({ nearestBusStop: bus(8, null), walkMinutes: 8 }))
    expect(r.mode).toBe('UNKNOWN')
    expect(r.reason).toContain('運行データが公開されていない')
  })

  it('便数が閾値未満なら CAR_RECOMMENDED', () => {
    const r = assessAccessMode(input({ nearestBusStop: bus(8, 3), walkMinutes: 8 }))
    expect(r.mode).toBe('CAR_RECOMMENDED')
    expect(r.reason).toContain('平日3本/日')
  })

  it('最寄り交通ノードから徒歩上限を超えたら CAR_ONLY', () => {
    const r = assessAccessMode(input({ nearestBusStop: bus(50, 2), walkMinutes: 75 }))
    expect(r.mode).toBe('CAR_ONLY')
  })

  it('駅もバス停も無ければ CAR_ONLY', () => {
    expect(assessAccessMode(input()).mode).toBe('CAR_ONLY')
  })

  it('系統が駅に接続しないバスは TRAIN_BUS にしない', () => {
    const r = assessAccessMode(
      input({ nearestBusStop: bus(8, 20, false), walkMinutes: 8 }),
    )
    expect(r.mode).not.toBe('TRAIN_BUS')
  })

  it('判定理由を必ず返す', () => {
    for (const i of [
      input({ nearestStation: station(5) }),
      input({ nearestBusStop: bus(5, null) }),
      input(),
    ]) {
      expect(assessAccessMode(i).reason.length).toBeGreaterThan(0)
    }
  })
})

describe('assessWalkLoad', () => {
  it('距離で判定する', () => {
    expect(assessWalkLoad(10, 0)).toBe('EASY')
    expect(assessWalkLoad(20, 0)).toBe('MODERATE')
    expect(assessWalkLoad(35, 0)).toBe('HARD')
  })

  it('★登りは距離では代替できない（徒歩10分でも登り150mならきつい）', () => {
    expect(assessWalkLoad(10, 150)).toBe('HARD')
    expect(assessWalkLoad(10, 45)).toBe('MODERATE')
  })

  it('距離と登りの重い方を採る', () => {
    expect(assessWalkLoad(35, 5)).toBe('HARD')
    expect(assessWalkLoad(5, 120)).toBe('HARD')
  })

  it('標高が取れなければ距離だけで判定する', () => {
    expect(assessWalkLoad(20, null)).toBe('MODERATE')
  })
})

describe('assessAccess', () => {
  it('2軸を両方返す', () => {
    const r = assessAccess(
      input({
        nearestStation: station(12),
        walkMinutes: 12,
        ascentM: 18,
        reliefAroundM: 10,
      }),
    )
    expect(r.accessMode).toBe('TRAIN_ONLY')
    expect(r.walkLoad).toBe('EASY')
    expect(r.ascentM).toBe(18)
    expect(r.computedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('山上の社: 電車で行けるが徒歩負荷は HARD', () => {
    const r = assessAccess(
      input({ nearestStation: station(20), walkMinutes: 42, ascentM: 210 }),
    )
    expect(r.accessMode).toBe('TRAIN_ONLY')
    expect(r.walkLoad).toBe('HARD')
  })
})

describe('isReachableWithoutCar — 「車なしで行ける」フィルタ', () => {
  it('電車のみ・電車＋バスは true', () => {
    expect(isReachableWithoutCar('TRAIN_ONLY')).toBe(true)
    expect(isReachableWithoutCar('TRAIN_BUS')).toBe(true)
  })

  it('★UNKNOWN は既定で false。含めるかは呼び出し側が選ぶ', () => {
    expect(isReachableWithoutCar('UNKNOWN')).toBe(false)
    expect(isReachableWithoutCar('UNKNOWN', true)).toBe(true)
  })

  it('車必須は false', () => {
    expect(isReachableWithoutCar('CAR_ONLY')).toBe(false)
    expect(isReachableWithoutCar('CAR_RECOMMENDED')).toBe(false)
  })
})

describe('ACCESS_SORT_ORDER — 目的への適合順（良さの順位ではない）', () => {
  it('公共交通で行きやすい順に並ぶ', () => {
    const modes: AccessMode[] = ['CAR_ONLY', 'TRAIN_BUS', 'UNKNOWN', 'TRAIN_ONLY']
    modes.sort((a, b) => ACCESS_SORT_ORDER[a] - ACCESS_SORT_ORDER[b])
    expect(modes).toEqual(['TRAIN_ONLY', 'TRAIN_BUS', 'UNKNOWN', 'CAR_ONLY'])
  })

  it('UNKNOWN は CAR_ONLY より前（可能性を捨てない）', () => {
    expect(ACCESS_SORT_ORDER.UNKNOWN).toBeLessThan(ACCESS_SORT_ORDER.CAR_ONLY)
  })
})

describe('閾値は実地検証で調整する前提', () => {
  it('既定値が設計書の記載と一致する', () => {
    expect(DEFAULT_THRESHOLDS.minTripsWeekday).toBe(6)
    expect(DEFAULT_THRESHOLDS.moderateWalkMin).toBe(15)
    expect(DEFAULT_THRESHOLDS.hardWalkMin).toBe(30)
    expect(DEFAULT_THRESHOLDS.moderateAscentM).toBe(30)
    expect(DEFAULT_THRESHOLDS.hardAscentM).toBe(100)
  })
})
