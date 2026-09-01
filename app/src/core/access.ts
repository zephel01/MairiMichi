/**
 * アクセス難易度の判定（設計書 §6）
 *
 * 差別化の核。「車なしで行ける縁結び神社」は現在どこでも検索できない。
 *
 * ★設計上いちばん大事なこと
 *   判定は「可／不可」の二値ではなく、UNKNOWN を必ず持つ四値以上にする。
 *   二値に潰すと GTFS 未整備地域の社寺を軒並み「車必須」と誤判定する。
 *
 *   オープンライセンスで使える最新のバス運行本数は存在しない:
 *     国土数値情報 N07 バスルートは 2022年版で運行頻度属性が削除された
 *     （2011年版にはあるが非商用かつ15年前）
 *   → 運行本数は GTFS からしか取れない
 *   → GTFS は全国網羅していない（gtfs-data.jp は7県が空白、
 *      京都市営バスは ODPT にしか無い）
 *   → 「バス停はあるが便数不明」という状態が必ず残る = UNKNOWN
 */

import type {
  AccessAssessment,
  AccessMode,
  BusStopRef,
  StationRef,
  WalkLoad,
} from './types'

/**
 * 判定の閾値。
 * ★初期値は仮。Phase 1f の実地検証で調整する（自信度 LOW）。
 */
export interface AccessThresholds {
  /** 駅から徒歩でよいとみなす上限（分） */
  stationWalkMaxMin: number
  /** バス停から徒歩でよいとみなす上限（分） */
  busWalkMaxMin: number
  /** これ未満の便数なら公共交通で行けるとは言わない（平日・本/日） */
  minTripsWeekday: number
  /** これを超える徒歩は車必須とみなす（分） */
  carOnlyWalkMin: number
  /** 徒歩負荷 MODERATE の下限 */
  moderateWalkMin: number
  moderateAscentM: number
  /** 徒歩負荷 HARD の下限 */
  hardWalkMin: number
  hardAscentM: number
}

export const DEFAULT_THRESHOLDS: AccessThresholds = {
  stationWalkMaxMin: 25,
  busWalkMaxMin: 20,
  minTripsWeekday: 6,
  carOnlyWalkMin: 60,
  moderateWalkMin: 15,
  moderateAscentM: 30,
  hardWalkMin: 30,
  hardAscentM: 100,
}

export interface AccessInput {
  nearestStation: StationRef | null
  nearestBusStop: BusStopRef | null
  walkDistanceM: number | null
  walkMinutes: number | null
  ascentM: number | null
  descentM: number | null
  reliefAroundM: number | null
}

/**
 * 徒歩負荷。距離と登りの「いずれか」が閾値を超えたら重い方を採る。
 * 登りは距離では代替できない（徒歩10分でも登り150mならきつい）。
 */
export function assessWalkLoad(
  walkMinutes: number | null,
  ascentM: number | null,
  t: AccessThresholds = DEFAULT_THRESHOLDS,
): WalkLoad {
  const byTime =
    walkMinutes === null
      ? 'EASY'
      : walkMinutes >= t.hardWalkMin
        ? 'HARD'
        : walkMinutes >= t.moderateWalkMin
          ? 'MODERATE'
          : 'EASY'
  const byAscent =
    ascentM === null
      ? 'EASY'
      : ascentM >= t.hardAscentM
        ? 'HARD'
        : ascentM >= t.moderateAscentM
          ? 'MODERATE'
          : 'EASY'
  const order: WalkLoad[] = ['EASY', 'MODERATE', 'HARD']
  return order[Math.max(order.indexOf(byTime), order.indexOf(byAscent))]!
}

/**
 * 到達手段を判定する。
 *
 * 判定順:
 *   1. 駅から徒歩圏 → TRAIN_ONLY
 *   2. バス停があり、便数が取れていて閾値以上、かつ駅接続 → TRAIN_BUS
 *   3. バス停があるが便数が null（GTFS未整備） → UNKNOWN  ★これを必ず残す
 *   4. バス停はあるが便数が閾値未満 → CAR_RECOMMENDED
 *   5. どれにも当たらない → CAR_ONLY
 */
export function assessAccessMode(
  input: AccessInput,
  t: AccessThresholds = DEFAULT_THRESHOLDS,
): { mode: AccessMode; reason: string } {
  const { nearestStation, nearestBusStop, walkMinutes } = input

  if (nearestStation && nearestStation.walkMin <= t.stationWalkMaxMin) {
    return {
      mode: 'TRAIN_ONLY',
      reason: `${nearestStation.name}から徒歩${nearestStation.walkMin}分。`,
    }
  }

  if (nearestBusStop) {
    const trips = nearestBusStop.tripsWeekday
    if (trips === null) {
      return {
        mode: 'UNKNOWN',
        reason:
          nearestBusStop.unknownReason ??
          `バス停「${nearestBusStop.name}」はありますが、この地域のバス運行データが公開されていないため便数を確認できません。現地の時刻表をご確認ください。`,
      }
    }
    if (
      trips >= t.minTripsWeekday &&
      nearestBusStop.walkMin <= t.busWalkMaxMin &&
      nearestBusStop.connectsToStation !== false
    ) {
      return {
        mode: 'TRAIN_BUS',
        reason: `バス停「${nearestBusStop.name}」（平日${trips}本/日）から徒歩${nearestBusStop.walkMin}分。`,
      }
    }
    if (walkMinutes !== null && walkMinutes > t.carOnlyWalkMin) {
      return {
        mode: 'CAR_ONLY',
        reason: `最寄りの交通機関から徒歩${walkMinutes}分。公共交通では現実的ではありません。`,
      }
    }
    return {
      mode: 'CAR_RECOMMENDED',
      reason:
        trips < t.minTripsWeekday
          ? `バス停「${nearestBusStop.name}」の便数が平日${trips}本/日と少ないため、車をおすすめします。`
          : `バス停「${nearestBusStop.name}」から徒歩${nearestBusStop.walkMin}分と離れています。`,
    }
  }

  if (nearestStation) {
    if (walkMinutes !== null && walkMinutes > t.carOnlyWalkMin) {
      return {
        mode: 'CAR_ONLY',
        reason: `最寄り駅${nearestStation.name}から徒歩${nearestStation.walkMin}分。公共交通では現実的ではありません。`,
      }
    }
    return {
      mode: 'CAR_RECOMMENDED',
      reason: `最寄り駅${nearestStation.name}から徒歩${nearestStation.walkMin}分。バス路線は確認できていません。`,
    }
  }

  return {
    mode: 'CAR_ONLY',
    reason: '徒歩圏に鉄道駅・バス停が見つかりませんでした。',
  }
}

export function assessAccess(
  input: AccessInput,
  t: AccessThresholds = DEFAULT_THRESHOLDS,
  now = new Date(),
): AccessAssessment {
  const { mode, reason } = assessAccessMode(input, t)
  return {
    accessMode: mode,
    walkLoad: assessWalkLoad(input.walkMinutes, input.ascentM, t),
    nearestStation: input.nearestStation,
    nearestBusStop: input.nearestBusStop,
    walkDistanceM: input.walkDistanceM,
    walkMinutes: input.walkMinutes,
    ascentM: input.ascentM,
    descentM: input.descentM,
    reliefAroundM: input.reliefAroundM,
    reason,
    computedAt: now.toISOString(),
  }
}

// ─────────────────────────────────────────────────────────
// 表示（色のみに依存しない。アイコン＋文言）
// ─────────────────────────────────────────────────────────

export const ACCESS_MODE_LABEL: Record<AccessMode, { icon: string; label: string }> = {
  TRAIN_ONLY: { icon: '🚃', label: '電車のみ' },
  TRAIN_BUS: { icon: '🚌', label: '電車＋バス' },
  CAR_RECOMMENDED: { icon: '🚗', label: '車がおすすめ' },
  CAR_ONLY: { icon: '🚗', label: '車が必要' },
  UNKNOWN: { icon: '❓', label: '判定不能' },
}

export const WALK_LOAD_LABEL: Record<WalkLoad, string> = {
  EASY: 'らく',
  MODERATE: 'ふつう',
  HARD: 'きつい',
}

/** 「車なしで行ける」フィルタ。★UNKNOWN を含めるかは呼び出し側で選ぶ */
export function isReachableWithoutCar(
  mode: AccessMode,
  includeUnknown = false,
): boolean {
  if (mode === 'TRAIN_ONLY' || mode === 'TRAIN_BUS') return true
  if (mode === 'UNKNOWN') return includeUnknown
  return false
}

/** 「目的への適合順」のソートキー（§9.2-a）。良さの順位ではない */
export const ACCESS_SORT_ORDER: Record<AccessMode, number> = {
  TRAIN_ONLY: 0,
  TRAIN_BUS: 1,
  CAR_RECOMMENDED: 2,
  UNKNOWN: 3,
  CAR_ONLY: 4,
}
