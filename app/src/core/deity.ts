/**
 * 祭神・本尊 → 神格クラスタ の正規化。
 *
 * なぜ必要か（設計書 §5.3）:
 *   Wikidata では同一の信仰対象が別QIDに分裂している。
 *     八幡神 Q261637(1,741) ⇔ 応神天皇 Q317997(334)
 *     稲荷神 Q719665(1,154) ⇔ ウカノミタマ Q3080728(157)
 *     天満大自在天神 Q1753428(655) ⇔ 菅原道真 Q382005(170)
 *     素戔嗚尊 Q272993(1,003) ⇔ 牛頭天王 Q11570247(580)
 *     観音は6分裂
 *   素直に GROUP BY すると御利益付与が破綻する。
 *
 * 効果（400社サンプルの実測）:
 *   素朴な40エントリ辞書        165社 (41.2%)
 *   ＋素テキスト照合             195社 (48.8%)
 *   27クラスタ＋別名辞書に再設計  274社 (68.5%)  ★
 *
 * 突合の優先順:
 *   1. Wikidata QID 完全一致
 *   2. ja.Wikipedia のリンク先記事名 完全一致  ← 表示名ではなくリンク先
 *   3. 正規化後の別名一致
 *   4. 一致しなければ clusterId = null（＝unknown。隠さず出す）
 */

import type { DeityCluster, ExtractedDeity, NormalizedDeity } from './types'

/**
 * 表記ゆれの正規化。
 * 「天照皇大神」/「天照大神」、「素盞鳴命」/「素戔嗚尊」、
 * 「金山毘古命」/「金山彦命」のような揺れを吸収する。
 *
 * ★語尾（命・尊・神・大神…）は落とす。これが最も多い揺れ。
 * ★旧字・異体字は代表字に寄せる。
 */
const VARIANT_MAP: ReadonlyArray<[RegExp, string]> = [
  // ★複数文字の綴りを先に寄せる。1文字ずつ置換すると
  //   「毘古」→「彦彦」のように壊れる（実際に踏んだ）
  [/毘古|比古/g, '彦'],
  [/毘売|比売|媛/g, '姫'],
  [/[戔盞]/g, '戔'],
  [/[嗚鳴]/g, '嗚'],
  [/[國国]/g, '国'],
  [/[龍竜]/g, '竜'],
  [/[櫻桜]/g, '桜'],
  [/[藝芸]/g, '芸'],
  [/[燈灯]/g, '灯'],
  [/[禱祷]/g, '祷'],
  [/[彌弥]/g, '弥'],
  [/[體体]/g, '体'],
  [/[惠恵]/g, '恵'],
  [/[濱浜]/g, '浜'],
  [/[劍剣釼]/g, '剣'],
  [/[甞嘗]/g, '嘗'],
]

/** 敬称・語尾。末尾から繰り返し落とす */
const HONORIFIC_SUFFIXES = [
  '大御神',
  '大明神',
  '大権現',
  '大神',
  '御魂',
  '命',
  '尊',
  '神',
  '公',
  '卿',
  '様',
  '菩薩',
  '如来',
  '明王',
  '天',
  '権現',
]

/** カタカナ→ひらがな（イチキシマヒメ ⇔ 市杵島姫 の橋渡し用ではなく、カナ表記同士の統一） */
function kataToHira(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  )
}

/**
 * 神名を正規化キーに変換する。
 * 空白・中黒・括弧を落とし、異体字を寄せ、敬称語尾を剥がす。
 */
export function normalizeDeityName(input: string): string {
  let s = input.trim()
  s = s.replace(/[（(][^）)]*[）)]/g, '')
  s = s.replace(/[\s　・･、,。．.]/g, '')
  s = s.replace(/^(主祭神|祭神|本尊|御祭神)[:：]?/, '')
  for (const [re, to] of VARIANT_MAP) s = s.replace(re, to)
  s = kataToHira(s)

  // 敬称語尾を末尾から繰り返し落とす。ただし全部消えるなら落とさない
  let changed = true
  while (changed) {
    changed = false
    for (const suf of HONORIFIC_SUFFIXES) {
      const sufN = kataToHira(suf)
      if (s.length > sufN.length && s.endsWith(sufN)) {
        s = s.slice(0, -sufN.length)
        changed = true
        break
      }
    }
  }
  return s
}

export interface DeityIndex {
  byQid: Map<string, string>
  byName: Map<string, string>
  clusters: Map<string, DeityCluster>
}

/** クラスタ定義から検索インデックスを作る */
export function buildDeityIndex(clusters: DeityCluster[]): DeityIndex {
  const byQid = new Map<string, string>()
  const byName = new Map<string, string>()
  const map = new Map<string, DeityCluster>()

  for (const c of clusters) {
    map.set(c.id, c)
    for (const q of c.qids) {
      if (!byQid.has(q)) byQid.set(q, c.id)
    }
    for (const a of [c.label, ...c.aliases]) {
      const key = normalizeDeityName(a)
      if (key.length === 0) continue
      // 先勝ち。定義順が優先度になるので、曖昧な別名は後ろのクラスタに置く
      if (!byName.has(key)) byName.set(key, c.id)
    }
  }
  return { byQid, byName, clusters: map }
}

/**
 * 1件の祭神をクラスタへ正規化する。
 * 一致しなければ clusterId: null（推測しない）。
 */
export function normalizeDeity(
  deity: ExtractedDeity,
  index: DeityIndex,
  qid?: string | null,
): NormalizedDeity {
  if (qid) {
    const byQid = index.byQid.get(qid)
    if (byQid) return { ...deity, clusterId: byQid, matchedBy: 'qid' }
  }

  // ★リンク先記事名を優先する。表示名の揺れ 41.2% をここで吸収する
  if (deity.linkTarget) {
    const key = normalizeDeityName(deity.linkTarget)
    const hit = index.byName.get(key)
    if (hit) return { ...deity, clusterId: hit, matchedBy: 'linkTarget' }
  }

  const key = normalizeDeityName(deity.display)
  const hit = index.byName.get(key)
  if (hit) return { ...deity, clusterId: hit, matchedBy: 'alias' }

  return { ...deity, clusterId: null, matchedBy: null }
}

export function normalizeDeities(
  deities: ExtractedDeity[],
  index: DeityIndex,
  qidByDisplay?: Map<string, string>,
): NormalizedDeity[] {
  return deities.map((d) =>
    normalizeDeity(d, index, qidByDisplay?.get(d.display) ?? null),
  )
}

/** 同定率。データ品質の可視化に使う（目標: 約68%） */
export function identificationRate(normalized: NormalizedDeity[]): number {
  if (normalized.length === 0) return 0
  const hit = normalized.filter((d) => d.clusterId !== null).length
  return hit / normalized.length
}
