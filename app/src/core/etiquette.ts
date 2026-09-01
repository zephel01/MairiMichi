/**
 * 参拝作法（設計書 §7）
 *
 * ★最重要の運用ルール: 作法は推定してはならない。
 *   御利益は「祭神からの推定」と明示すれば許容されるが、
 *   作法は現地での行動を規定するため、外れると実害が出る。
 *
 *   - 既定値: 神社 = 二礼二拍手一礼 / 寺院 = 合掌（拍手しない）
 *   - 例外の登録は、その社寺の公式サイト等の一次情報のURLが取れた場合のみ
 *   - 出典が取れない例外情報は登録しない
 */

import type { Etiquette, SiteType } from './types'

export const SHRINE_DEFAULT: Etiquette = {
  bowBefore: 2,
  clap: 2,
  bowAfter: 1,
  label: '二礼二拍手一礼',
  notes: '一般的な作法です。',
  sourceUrl: null,
  sourceType: 'default',
}

export const TEMPLE_DEFAULT: Etiquette = {
  bowBefore: 1,
  // ★寺院は拍手を打たない
  clap: 0,
  bowAfter: 1,
  label: '合掌（拍手はしません）',
  notes: '山門で一礼し、本堂で静かに合掌します。拍手は打ちません。',
  sourceUrl: null,
  sourceType: 'default',
}

/** 全ページに固定表示する文言 */
export const ETIQUETTE_DISCLAIMER =
  '作法は社寺により異なる場合があります。現地の案内表示に従ってください。'

export interface EtiquetteOverride extends Etiquette {
  siteKey: string
  name: string
  status?: 'PENDING_VERIFICATION' | 'VERIFIED'
}

/**
 * 作法を解決する。
 *
 * ★一次情報の URL が無い override は採用しない。
 *   status が PENDING_VERIFICATION のものは既定値を返し、
 *   「未確認」であることを呼び出し側に伝える。
 */
export function resolveEtiquette(
  type: SiteType,
  override?: EtiquetteOverride,
): { etiquette: Etiquette; pendingVerification: boolean } {
  const base = type === 'shrine' ? SHRINE_DEFAULT : TEMPLE_DEFAULT

  if (!override) return { etiquette: base, pendingVerification: false }

  // 出典が無ければ採用しない
  if (!override.sourceUrl || override.sourceType !== 'official') {
    return { etiquette: base, pendingVerification: true }
  }

  return {
    etiquette: {
      bowBefore: override.bowBefore,
      clap: override.clap,
      bowAfter: override.bowAfter,
      label: override.label,
      notes: override.notes,
      sourceUrl: override.sourceUrl,
      sourceType: 'official',
      verifiedAt: override.verifiedAt,
    },
    pendingVerification: false,
  }
}

/** 表示用の文言を組む */
export function describeEtiquette(e: Etiquette): string {
  if (e.clap === 0) return e.label
  return `${numToKanji(e.bowBefore)}礼${numToKanji(e.clap)}拍手${numToKanji(e.bowAfter)}礼`
}

function numToKanji(n: number): string {
  const t = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九']
  return t[n] ?? String(n)
}

// ─────────────────────────────────────────────────────────
// 宗派に起因するルール（御朱印と連動・§7.5）
// ─────────────────────────────────────────────────────────

export interface DenominationRule {
  denomination: string
  match: string[]
  goshuinNote: string
  goshuinDefault: 'yes' | 'no' | 'unknown'
}

export const DENOMINATION_RULES: DenominationRule[] = [
  {
    denomination: '浄土真宗',
    match: ['浄土真宗', '真宗大谷派', '浄土真宗本願寺派', '真宗高田派', '真宗佛光寺派'],
    goshuinNote:
      '浄土真宗では原則として御朱印を授与していません。一部の寺院で「法語印」を授与している場合があります。',
    goshuinDefault: 'no',
  },
  {
    denomination: '日蓮宗',
    match: ['日蓮宗', '法華宗', '日蓮正宗', '顕本法華宗'],
    goshuinNote:
      '日蓮宗では「御首題」を授与します。「妙法」との区別があり、御首題帳でないとお断りされる場合があります。',
    goshuinDefault: 'unknown',
  },
]

/** 宗派から御朱印の注記を引く */
export function denominationRuleFor(
  denomination: string | null | undefined,
): DenominationRule | null {
  if (!denomination) return null
  for (const rule of DENOMINATION_RULES) {
    if (rule.match.some((m) => denomination.includes(m))) return rule
  }
  return null
}
