/**
 * 神格クラスタ → 御利益 の導出。
 *
 * 設計上の核（設計書 §5.4）:
 *   主要な祭神はどれも6項目前後の御利益を持ち、五穀豊穣・商売繁盛・家内安全・
 *   厄除け はほぼ全員が持っている。素直に全部付与すると全社寺が全カテゴリに
 *   該当し、検索が機能しない（競合ホトカミの「1寺社に10タグ」問題）。
 *
 *   → primary は各クラスタ 1〜2個だけ。一覧の絞り込みは既定で primary のみ。
 *     secondary はトグル「関連する御利益も含める」で開放する。
 *
 * ★導出根拠を必ず持たせる（F-02）。
 *   どの祭神・どのクラスタから来たかを DerivedBenefit に残す。
 *   これが無い御利益は作らない。
 */

import type {
  BenefitMajorId,
  BenefitMinorId,
  ClusterBenefit,
  DerivedBenefit,
  NormalizedDeity,
  SiteLore,
} from './types'

export interface BenefitTaxonomy {
  /** 細分類ID → 大分類ID */
  majorOf: Map<BenefitMinorId, BenefitMajorId>
  /** 細分類ID → ラベル */
  labelOf: Map<BenefitMinorId, string>
}

export interface DeriveOptions {
  /** secondary も含めるか。既定は false（primary のみ） */
  includeSecondary?: boolean
}

/**
 * 祭神から御利益を導出する。
 *
 * - 複数祭神は常態（1柱157社/2柱57/3柱43/4柱11/5柱4/6柱1/8柱1）。
 *   同じ御利益が複数の祭神から出たら、より強い weight を採用し、
 *   導出元は最初に当たった祭神を記録する。
 * - policy が NO_AUTO_MAPPING / NO_CURRENT_BENEFIT のクラスタは何も出さない。
 *   人物神（400社中72社=18%）と阿弥陀・釈迦がこれに当たる。
 */
export function deriveBenefits(
  deities: NormalizedDeity[],
  clusterBenefits: Map<string, ClusterBenefit>,
  taxonomy: BenefitTaxonomy,
  options: DeriveOptions = {},
): DerivedBenefit[] {
  const includeSecondary = options.includeSecondary ?? true
  const out = new Map<BenefitMinorId, DerivedBenefit>()

  for (const deity of deities) {
    if (!deity.clusterId) continue
    const cb = clusterBenefits.get(deity.clusterId)
    if (!cb) continue
    // 定型マッピングが存在しないクラスタは何も出さない
    if (cb.policy === 'NO_AUTO_MAPPING' || cb.policy === 'NO_CURRENT_BENEFIT') continue

    const add = (benefitId: BenefitMinorId, weight: 'primary' | 'secondary') => {
      const majorId = taxonomy.majorOf.get(benefitId)
      if (!majorId) return // タクソノミに無いIDは黙って捨てず、呼び出し側の検証で拾う
      const existing = out.get(benefitId)
      if (existing) {
        // primary が一度でも出たら primary に昇格
        if (existing.weight === 'secondary' && weight === 'primary') {
          existing.weight = 'primary'
          existing.derivedFromDeity = deity.display
          existing.derivedFromCluster = deity.clusterId
        }
        return
      }
      out.set(benefitId, {
        benefitId,
        majorId,
        weight,
        confidence: 'derived',
        derivedFromDeity: deity.display,
        derivedFromCluster: deity.clusterId,
      })
    }

    for (const b of cb.primary) add(b, 'primary')
    if (includeSecondary) for (const b of cb.secondary) add(b, 'secondary')
  }

  return [...out.values()]
}

/**
 * 公式サイト等の一次情報で上書きする。
 * official は derived より常に優先し、sourceUrl を必須にする。
 */
export function applyOfficialOverrides(
  derived: DerivedBenefit[],
  lore: SiteLore[],
  taxonomy: BenefitTaxonomy,
): DerivedBenefit[] {
  const out = new Map<BenefitMinorId, DerivedBenefit>()
  for (const d of derived) out.set(d.benefitId, d)

  for (const l of lore) {
    if (!l.benefitId) continue
    if (!l.sourceUrl) continue // 出典なしは受け付けない
    const majorId = taxonomy.majorOf.get(l.benefitId)
    if (!majorId) continue
    out.set(l.benefitId, {
      benefitId: l.benefitId,
      majorId,
      weight: 'primary',
      confidence: 'official',
      derivedFromDeity: null,
      derivedFromCluster: null,
      sourceUrl: l.sourceUrl,
    })
  }
  return [...out.values()]
}

/**
 * 一覧の絞り込み対象。既定は primary のみ（§5.4）。
 */
export function filterForSearch(
  benefits: DerivedBenefit[],
  includeRelated = false,
): DerivedBenefit[] {
  if (includeRelated) return benefits
  return benefits.filter((b) => b.weight === 'primary')
}

/**
 * F-02 導出根拠の表示。
 *
 * ★断定しない。「効きます」ではなく「信仰されています」。
 *   表現規約は設計書 §9.3。
 */
export function explainDerivation(
  b: DerivedBenefit,
  taxonomy: BenefitTaxonomy,
): string {
  const label = taxonomy.labelOf.get(b.benefitId) ?? b.benefitId
  if (b.confidence === 'official') {
    return `「${label}」— この社寺の公式情報に記載があります。`
  }
  if (b.confidence === 'derived' && b.derivedFromDeity) {
    return `「${label}」— ${b.derivedFromDeity}をお祀りしているため（祭神・本尊にもとづく推定）。`
  }
  return `「${label}」— 分類の根拠を確認できていません。`
}

/** 御利益が1つも付かなかった社寺の表示。隠さず出す（§2.2-2） */
export const NO_BENEFIT_NOTICE =
  'この社寺のご利益は、祭神・本尊からは特定できていません。文化財指定・札所・御朱印の情報をご覧ください。'

/**
 * 願いの内訳と導出結果を突き合わせ、
 * 「祭神では説明できない信仰実態」を検出する（§9.1.6）。
 * ここに出た社寺が手動キュレーションの最優先対象になる。
 */
export function findUnexplainedWishes(
  derived: DerivedBenefit[],
  wishCounts: Map<BenefitMinorId, number>,
  minCount = 3,
): BenefitMinorId[] {
  const derivedIds = new Set(derived.map((d) => d.benefitId))
  const out: BenefitMinorId[] = []
  for (const [benefitId, count] of wishCounts) {
    if (count >= minCount && !derivedIds.has(benefitId)) out.push(benefitId)
  }
  return out.sort((a, b) => (wishCounts.get(b) ?? 0) - (wishCounts.get(a) ?? 0))
}
