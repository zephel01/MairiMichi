import {
  ACCESS_MODE_LABEL,
  WALK_LOAD_LABEL,
  isReachableWithoutCar,
} from '@/core/access'
import type { AccessAssessment } from '@/core/types'

/**
 * アクセス難易度の表示。
 *
 * ★色のみに依存しない。アイコン＋文言を必ず併記する（非機能要件）。
 * ★UNKNOWN は「分からない」と正直に書く。ここを曖昧にすると信頼を失う。
 */
export function AccessBadge({ access }: { access: AccessAssessment | undefined }) {
  if (!access) {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-600">
        <span aria-hidden>❓</span>
        アクセス未調査
      </span>
    )
  }

  const mode = ACCESS_MODE_LABEL[access.accessMode]
  const tone =
    access.accessMode === 'TRAIN_ONLY'
      ? 'border-access-train text-access-train'
      : access.accessMode === 'TRAIN_BUS'
        ? 'border-access-bus text-access-bus'
        : access.accessMode === 'UNKNOWN'
          ? 'border-access-unknown text-access-unknown'
          : 'border-access-car text-access-car'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs ${tone}`}
    >
      <span aria-hidden>{mode.icon}</span>
      {mode.label}
      <span className="text-neutral-400">/</span>
      徒歩{WALK_LOAD_LABEL[access.walkLoad]}
    </span>
  )
}

/** 一覧カード・詳細ページのアクセス欄 */
export function AccessDetail({ access }: { access: AccessAssessment | undefined }) {
  if (!access) {
    return <p className="text-sm text-neutral-600">アクセスはまだ調べていません。</p>
  }

  const parts: string[] = []
  if (access.walkMinutes !== null) parts.push(`徒歩${access.walkMinutes}分`)
  if (access.ascentM !== null) parts.push(`登り${Math.round(access.ascentM)}m`)

  return (
    <div className="text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <AccessBadge access={access} />
        {parts.length > 0 && <span className="text-neutral-700">{parts.join(' / ')}</span>}
      </div>

      <p className="mt-1 text-neutral-700">{access.reason}</p>

      {access.accessMode === 'UNKNOWN' && (
        <p className="mt-1 rounded bg-neutral-100 p-2 text-xs text-neutral-700">
          この地域はバスの運行データが公開されていないため、
          <strong>車が必要かどうかを判定できていません</strong>。
          バス停の位置は地図に表示しています。現地の時刻表をご確認ください。
        </p>
      )}

      {access.walkLoad === 'HARD' && (
        <p className="mt-1 text-xs text-neutral-700">
          参道の登りがあります。歩きやすい靴をおすすめします。
        </p>
      )}

      {access.reliefAroundM !== null && access.reliefAroundM >= 30 && (
        <p className="mt-1 text-xs text-neutral-600">
          周辺より約{Math.round(access.reliefAroundM)}m 高い場所にあります。
        </p>
      )}
    </div>
  )
}

/** 「車なしで行ける」フィルタのラベル */
export function carFreeLabel(access: AccessAssessment | undefined): string {
  if (!access) return '未調査'
  return isReachableWithoutCar(access.accessMode) ? '車なしで行ける' : '車が必要'
}
