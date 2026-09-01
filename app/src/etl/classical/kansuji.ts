/**
 * 漢数字 → 数値。
 * 延喜式神名帳の座数（「二座」「十九座」「五十三座」「二千八百六十一」）を読むために使う。
 *
 * 対応: 一〜九 / 十百千 の位取り / 「〇」「零」/ 大字（壱弐参…）
 * 非対応: 万以上（神名帳には出てこない）
 *
 * 欠字（〓・■）を含む場合は null を返す。推測で埋めない。
 */

const DIGITS: Record<string, number> = {
  〇: 0, 零: 0,
  一: 1, 壱: 1, 壹: 1,
  二: 2, 弐: 2, 貳: 2, 貮: 2,
  三: 3, 参: 3, 參: 3,
  四: 4, 肆: 4,
  五: 5, 伍: 5,
  六: 6, 陸: 6,
  七: 7, 柒: 7, 漆: 7,
  八: 8, 捌: 8,
  九: 9, 玖: 9,
}

const UNITS: Record<string, number> = {
  十: 10, 拾: 10,
  百: 100, 佰: 100, 陌: 100,
  千: 1000, 仟: 1000, 阡: 1000,
}

/**
 * 合字の数字。延喜式・六国史では普通に使われる。
 *   廿七座 = 27座 ／ 卅七座 = 37座
 * 単位ではなく「その値そのもの」なので、UNITS とは別に扱う。
 */
const LIGATURES: Record<string, number> = {
  廿: 20, 卄: 20,
  卅: 30, 丗: 30,
  卌: 40,
}

/** 欠字・破損を示す文字 */
export const DEFECT_CHARS = ['〓', '■', '□', '▲']

export function hasDefect(s: string): boolean {
  return DEFECT_CHARS.some((c) => s.includes(c))
}

/**
 * 漢数字文字列を数値に変換する。
 * 変換できない、または欠字を含む場合は null。
 */
export function parseKansuji(input: string): number | null {
  const s = input.trim()
  if (s.length === 0) return null
  if (hasDefect(s)) return null

  // アラビア数字がそのまま入っている場合も許容する
  if (/^[0-9]+$/.test(s)) return Number(s)

  let total = 0
  let section = 0 // 千・百・十をまたぐ現在の区画
  let digit: number | null = null
  let sawAny = false

  for (const ch of s) {
    if (ch in DIGITS) {
      digit = DIGITS[ch]!
      sawAny = true
      continue
    }
    if (ch in LIGATURES) {
      // 廿・卅 は値そのもの。直前に数字は付かない
      section += LIGATURES[ch]!
      digit = null
      sawAny = true
      continue
    }
    if (ch in UNITS) {
      const unit = UNITS[ch]!
      // 「十九」のように単位の前に数字が無い場合は 1 とみなす
      section += (digit ?? 1) * unit
      digit = null
      sawAny = true
      continue
    }
    // 想定外の文字が混ざっていたら失敗させる（黙って無視しない）
    return null
  }

  if (!sawAny) return null
  total = section + (digit ?? 0)
  return total
}

/**
 * 「◯◯座」から座数を取り出す。見つからなければ null。
 * 「二座」→ 2 ／ 「座」の記載が無い社は 1座 とみなすのは呼び出し側の責任。
 */
export function parseSeats(text: string): number | null {
  const m = text.match(
    /([〇零一二三四五六七八九十百千壱壹弐貳貮参參肆伍陸柒漆捌玖拾佰陌仟阡廿卄卅丗卌0-9〓■]+)座/,
  )
  if (!m || !m[1]) return null
  return parseKansuji(m[1])
}
