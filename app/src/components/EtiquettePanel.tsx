import { describeEtiquette, ETIQUETTE_DISCLAIMER } from '@/core/etiquette'
import type { Etiquette, Goshuin, SiteType } from '@/core/types'

/**
 * 参拝作法。
 *
 * ★出典の無い例外は表示しない（resolveEtiquette が既定値を返す）。
 *   二礼二拍手一礼が全ての神社で正解ではないが、
 *   一次情報が取れていないものを断定するほうが害が大きい。
 */
export function EtiquettePanel({
  etiquette,
  type,
  pendingVerification,
}: {
  etiquette: Etiquette
  type: SiteType
  pendingVerification?: boolean
}) {
  return (
    <div className="text-sm">
      <p className="text-lg font-medium">{describeEtiquette(etiquette)}</p>
      {etiquette.notes && <p className="mt-1 text-neutral-700">{etiquette.notes}</p>}

      {etiquette.sourceType === 'official' && etiquette.sourceUrl ? (
        <p className="mt-1 text-xs text-neutral-600">
          <span className="mr-1 rounded border border-emerald-600 px-1.5 py-0.5 text-[11px] text-emerald-700">
            公式サイト記載
          </span>
          <a href={etiquette.sourceUrl} className="underline" rel="noopener">
            出典
          </a>
          {etiquette.verifiedAt && `（${etiquette.verifiedAt} 確認）`}
        </p>
      ) : (
        <p className="mt-1 text-xs text-neutral-600">
          <span className="mr-1 rounded border border-neutral-400 px-1.5 py-0.5 text-[11px]">
            一般的な作法
          </span>
          {type === 'shrine'
            ? 'この社の個別の作法は確認できていません。'
            : '宗派により異なる場合があります。'}
        </p>
      )}

      {pendingVerification && (
        <p className="mt-1 text-xs text-neutral-600">
          ※この社寺には異なる作法があるとされていますが、一次情報を確認できていないため表示していません。
        </p>
      )}

      <p className="mt-2 text-xs text-neutral-600">{ETIQUETTE_DISCLAIMER}</p>
    </div>
  )
}

/**
 * 御朱印の実務情報。
 * ★ホトカミですら受付時間のフィールドを持っていない。ここが空白。
 */
export function GoshuinPanel({ goshuin }: { goshuin: Goshuin | undefined }) {
  if (!goshuin) {
    return <p className="text-sm text-neutral-600">御朱印の情報はまだ調べていません。</p>
  }

  if (goshuin.available === 'no') {
    return (
      <div className="text-sm">
        <p className="font-medium">御朱印の授与はありません</p>
        {goshuin.denominationNote && (
          <p className="mt-1 text-neutral-700">{goshuin.denominationNote}</p>
        )}
        <Verified at={goshuin.verifiedAt} url={goshuin.sourceUrl} />
      </div>
    )
  }

  if (goshuin.available === 'unknown') {
    return (
      <div className="text-sm">
        <p className="font-medium">御朱印の有無は確認できていません</p>
        {goshuin.denominationNote && (
          <p className="mt-1 text-neutral-700">{goshuin.denominationNote}</p>
        )}
        <p className="mt-1 text-xs text-neutral-600">
          無人の社寺では授与所が無く、いただけない場合があります。
        </p>
      </div>
    )
  }

  const rows: Array<[string, string]> = []
  if (goshuin.hours) {
    rows.push(['受付時間', `${goshuin.hours.from}〜${goshuin.hours.to}`])
  }
  if (goshuin.lunchBreak) {
    rows.push(['昼休み', `${goshuin.lunchBreak.from}〜${goshuin.lunchBreak.to}`])
  }
  rows.push([
    '書き方',
    {
      direct: '直書き',
      paper: '書き置きのみ',
      both: '直書き・書き置きの両方',
      seasonal: '時期による（繁忙期は書き置き）',
      unknown: '不明',
    }[goshuin.writeStyle],
  ])
  if (goshuin.fee !== undefined) rows.push(['初穂料', `${goshuin.fee}円`])
  if (goshuin.unmanned) rows.push(['授与所', '無人（不在の場合があります）'])
  if (goshuin.mailOrder === 'yes') rows.push(['郵送', '対応あり'])

  return (
    <div className="text-sm">
      <p className="font-medium">御朱印の授与があります</p>
      <dl className="mt-2 grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-neutral-600">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      {goshuin.hours && (
        <p className="mt-2 text-xs text-neutral-700">
          ※参拝時間と御朱印の受付時間は別です。御朱印のほうが早く終わることがあります。
        </p>
      )}
      {goshuin.limitedNote && (
        <p className="mt-1 text-xs text-neutral-700">{goshuin.limitedNote}</p>
      )}
      {goshuin.denominationNote && (
        <p className="mt-1 text-xs text-neutral-700">{goshuin.denominationNote}</p>
      )}
      <Verified at={goshuin.verifiedAt} url={goshuin.sourceUrl} />
    </div>
  )
}

/** ★変わりやすい情報なので鮮度を必ず出す */
function Verified({ at, url }: { at?: string; url?: string }) {
  if (!at) return null
  const months = monthsSince(at)
  return (
    <p className="mt-2 text-xs text-neutral-600">
      {at} 時点の情報
      {months !== null && months >= 6 && (
        <span className="ml-1 text-amber-700">（{months}ヶ月前。変更されている可能性があります）</span>
      )}
      {url && (
        <>
          {' '}
          <a href={url} className="underline" rel="noopener">
            公式サイトで確認
          </a>
        </>
      )}
    </p>
  )
}

export function monthsSince(dateStr: string, now = new Date()): number | null {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return null
  return Math.max(
    0,
    (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()),
  )
}
