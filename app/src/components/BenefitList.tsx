import { explainDerivation, NO_BENEFIT_NOTICE, type BenefitTaxonomy } from '@/core/derive'
import type { Confidence, DerivedBenefit } from '@/core/types'

/**
 * 御利益と、その導出根拠の表示。
 *
 * ★F-02 導出根拠の表示 がこのコンポーネントの本体。
 *   競合はどこも「なぜその御利益なのか」を書いていない。
 * ★確度バッジを必ず出す。約3割は unknown になる前提。
 * ★効果を断定しない（§9.3 の表現規約）。
 */

const CONFIDENCE_LABEL: Record<Confidence, { label: string; className: string }> = {
  official: {
    label: '公式サイト記載',
    className: 'border-emerald-600 text-emerald-700',
  },
  derived: {
    label: '祭神・本尊からの推定',
    className: 'border-amber-600 text-amber-700',
  },
  unknown: {
    label: '未確認',
    className: 'border-neutral-400 text-neutral-600',
  },
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const c = CONFIDENCE_LABEL[confidence]
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[11px] ${c.className}`}>
      {c.label}
    </span>
  )
}

export function BenefitList({
  benefits,
  taxonomy,
  showSecondary = false,
}: {
  benefits: DerivedBenefit[]
  taxonomy: BenefitTaxonomy
  showSecondary?: boolean
}) {
  const primary = benefits.filter((b) => b.weight === 'primary')
  const secondary = benefits.filter((b) => b.weight === 'secondary')

  if (primary.length === 0 && secondary.length === 0) {
    return (
      <p className="rounded bg-neutral-100 p-3 text-sm text-neutral-700">
        {NO_BENEFIT_NOTICE}
      </p>
    )
  }

  return (
    <div>
      <ul className="space-y-2">
        {primary.map((b) => (
          <li key={b.benefitId} className="text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">
                {taxonomy.labelOf.get(b.benefitId) ?? b.benefitId}
              </span>
              <ConfidenceBadge confidence={b.confidence} />
            </div>
            {/* ★導出根拠。これを出すのが本サイトの中核 */}
            <p className="mt-0.5 text-xs text-neutral-600">
              {explainDerivation(b, taxonomy)}
              {b.sourceUrl && (
                <>
                  {' '}
                  <a href={b.sourceUrl} className="underline" rel="noopener">
                    出典
                  </a>
                </>
              )}
            </p>
          </li>
        ))}
      </ul>

      {secondary.length > 0 && showSecondary && (
        <div className="mt-3 border-t pt-3">
          <p className="text-xs text-neutral-600">
            このほか、次のご利益でも信仰されています。
          </p>
          <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-700">
            {secondary.map((b) => (
              <li key={b.benefitId}>
                {taxonomy.labelOf.get(b.benefitId) ?? b.benefitId}
                {b.derivedFromDeity && (
                  <span className="text-neutral-500">（{b.derivedFromDeity}）</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** 全ページに固定表示する注記 */
export const BENEFIT_DISCLAIMER =
  '本サイトのご利益分類は、祭神・本尊に関する一般的な言説にもとづく参考情報です。正式なご祈祷の内容は各社寺の公式情報をご確認ください。'
