/**
 * 延喜式 神名帳（巻第九・巻第十）パーサ
 *
 * 入力: zh.wikisource の本文テキスト
 *   https://zh.wikisource.org/wiki/延喜式/卷第九  （神名上・39,178B）
 *   https://zh.wikisource.org/wiki/延喜式/卷第十  （神名下・44,845B）
 *   一括取得はダンプを使う（API はレート制限が厳しく429が頻発する）:
 *   https://dumps.wikimedia.org/zhwikisource/latest/zhwikisource-latest-pages-articles.xml.bz2
 *
 * 権利: 原文はパブリックドメイン。Wikisource 編集者による句読・校勘注は CC BY-SA 4.0。
 *       校勘注を落として原文だけを使えば PD 素材の利用となる。
 *
 * ★実データの癖（調査で実測・設計書 §5.6.3）
 *   1. 割注が ／…∥ という独自記法
 *        羽束師坐高御産日神社／大。月次新甞。∥
 *   2. 割注の中にも ／ が現れる（二行割注の改行）
 *        乙訓坐大雷神社／名神大。月／次新甞。∥
 *      → 最初の ／ だけを名前と注の区切りとし、残りは注の中で除去する
 *   3. 〓（欠字）と ■ が散在し、数値の一部が欠けている
 *        冒頭の総数規定も「天神地祇惣三千一百〓二座」
 *   4. 貞コ のような文字コード変換の残骸がある
 *   5. 現在の比定社（論社）は含まれない
 *      → 國學院大學 延喜式内社データベースで突合する
 *
 * ★推測で埋めない方針
 *   欠字を含む数値は null にする。社格が読めなければ rank を null にする。
 *   「たぶん大社だろう」で埋めない。
 */

import { parseKansuji, parseSeats, hasDefect } from './kansuji'
import type { Offering, ShikinaiRank } from '@/core/types'

/** 割注の開始・終了・内部改行 */
const NOTE_OPEN = '／'
const NOTE_CLOSE = '∥'

/** 文字コード変換の残骸。既知のものを列挙する（推測で直さない） */
export const KNOWN_MOJIBAKE: ReadonlyArray<{ pattern: string; note: string }> = [
  { pattern: '貞コ', note: '「貞観」の変換残骸とみられる（未確定）' },
]

export interface ParsedShrine {
  /** 社名（割注を除いた部分） */
  shrineName: string
  province: string
  district: string
  rank: ShikinaiRank | null
  offering: Offering
  offeringDetail: 'anjo' | 'ange' | null
  tsukinami: boolean
  niiname: boolean
  ainame: boolean
  /** 座数。記載が無ければ 1 */
  seats: number
  /** 割注の原文。★必ず残す（〓 を含みうる） */
  rawNote: string
  /** 行の原文 */
  rawLine: string
  /** 欠字・文字化けを検出したか。UI で「原文に欠字あり」と出す */
  hasDefect: boolean
  /** 検出した問題の内訳 */
  defects: string[]
}

export interface ParsedProvinceHeader {
  province: string
  totalSeats: number | null
  taiSeats: number | null
  shoSeats: number | null
  raw: string
}

export interface ParsedDistrictHeader {
  district: string
  totalSeats: number | null
  raw: string
}

export interface ShikinaiParseResult {
  shrines: ParsedShrine[]
  provinces: ParsedProvinceHeader[]
  districts: ParsedDistrictHeader[]
  /** パースできなかった行。捨てずに残して目視できるようにする */
  unparsed: string[]
  stats: {
    totalLines: number
    shrineLines: number
    withDefect: number
    rankUnknown: number
  }
}

// ─────────────────────────────────────────────────────────
// 割注の解析
// ─────────────────────────────────────────────────────────

/**
 * 「名神大。月／次新甞。」のような割注本文から属性を読む。
 *
 * ★「名神大」は「大」を含むので、必ず名神大を先に判定すること。
 */
export function parseNote(noteRaw: string): {
  rank: ShikinaiRank | null
  offering: Offering
  offeringDetail: 'anjo' | 'ange' | null
  tsukinami: boolean
  niiname: boolean
  ainame: boolean
  seats: number | null
} {
  // 二行割注の改行として現れる ／ を除去してから判定する
  const note = noteRaw.replace(/／/g, '')

  let rank: ShikinaiRank | null = null
  if (note.includes('名神大')) {
    rank = 'myojin_tai'
  } else if (/(^|[。\s])大([。\s]|$)/.test(note) || note.startsWith('大')) {
    rank = 'tai'
  } else if (/(^|[。\s])小([。\s]|$)/.test(note) || note.startsWith('小')) {
    rank = 'sho'
  }

  let offering: Offering = null
  let offeringDetail: 'anjo' | 'ange' | null = null
  if (note.includes('官幣') || note.includes('官幤')) {
    offering = 'kanpei'
    if (note.includes('案上')) offeringDetail = 'anjo'
    else if (note.includes('案下')) offeringDetail = 'ange'
  } else if (note.includes('国幣') || note.includes('國幣') || note.includes('國幤')) {
    offering = 'kokuhei'
  }

  // 新嘗・相嘗は旧字（甞）でも書かれる
  const tsukinami = note.includes('月次')
  const niiname = note.includes('新甞') || note.includes('新嘗')
  const ainame = note.includes('相甞') || note.includes('相嘗')

  const seats = parseSeats(note)

  return { rank, offering, offeringDetail, tsukinami, niiname, ainame, seats }
}

/**
 * 1行から社名と割注を切り出す。
 * ★最初の ／ だけを区切りとする（注の中にも ／ が出るため）。
 */
export function splitNameAndNote(line: string): { name: string; note: string } | null {
  const openIdx = line.indexOf(NOTE_OPEN)
  if (openIdx < 0) {
    // 割注が無い行（「川田神社二座」など）も社の行でありうる
    return { name: line.trim(), note: '' }
  }
  const closeIdx = line.lastIndexOf(NOTE_CLOSE)
  const name = line.slice(0, openIdx).trim()
  const note =
    closeIdx > openIdx
      ? line.slice(openIdx + 1, closeIdx).trim()
      : line.slice(openIdx + 1).trim()
  if (name.length === 0) return null
  return { name, note }
}

// ─────────────────────────────────────────────────────────
// 見出しの判定
// ─────────────────────────────────────────────────────────

/**
 * 国の見出し。例:「山城國百二十二座大五十三座小六十九座」
 *
 * ★注意: この見出し形式は、調査時点で実本文の全パターンを確認できていない。
 *   実データ投入時に unparsed を目視し、必要なら正規表現を調整すること。
 */
const PROVINCE_RE =
  /^(?<name>[^\s／∥]{1,6}[國国])(?<rest>.*)$/

/** 郡の見出し。例:「乙訓郡十九座大五座小十四座」 */
const DISTRICT_RE = /^(?<name>[^\s／∥]{1,8}[郡])(?<rest>.*)$/

/** 社の行らしさ。「神社」「社」「宮」「明神」で終わる、または割注を持つ */
const SHRINE_HINT = /(神社|神宮|大社|[^國国郡]社|宮)/

export function isProvinceHeader(line: string): boolean {
  if (!PROVINCE_RE.test(line)) return false
  // 「◯◯國造神社」のような社名を国見出しと誤認しないよう、座数の記載を要求する
  return /座/.test(line)
}

export function isDistrictHeader(line: string): boolean {
  if (!DISTRICT_RE.test(line)) return false
  return /座/.test(line)
}

export function parseProvinceHeader(line: string): ParsedProvinceHeader | null {
  const m = PROVINCE_RE.exec(line)
  if (!m?.groups) return null
  const rest = m.groups['rest'] ?? ''
  // 「百二十二座大五十三座小六十九座」を分解する
  const totalM = rest.match(/^([^大小]*?)座/)
  const taiM = rest.match(/大([^小座]*?)座/)
  const shoM = rest.match(/小([^大座]*?)座/)
  return {
    province: m.groups['name']!,
    totalSeats: totalM?.[1] ? parseKansuji(totalM[1]) : null,
    taiSeats: taiM?.[1] ? parseKansuji(taiM[1]) : null,
    shoSeats: shoM?.[1] ? parseKansuji(shoM[1]) : null,
    raw: line,
  }
}

export function parseDistrictHeader(line: string): ParsedDistrictHeader | null {
  const m = DISTRICT_RE.exec(line)
  if (!m?.groups) return null
  const rest = m.groups['rest'] ?? ''
  const totalM = rest.match(/^([^大小]*?)座/)
  return {
    district: m.groups['name']!,
    totalSeats: totalM?.[1] ? parseKansuji(totalM[1]) : null,
    raw: line,
  }
}

// ─────────────────────────────────────────────────────────
// 本体
// ─────────────────────────────────────────────────────────

function detectDefects(line: string): string[] {
  const found: string[] = []
  if (hasDefect(line)) found.push('欠字（〓/■）を含む')
  for (const { pattern, note } of KNOWN_MOJIBAKE) {
    if (line.includes(pattern)) found.push(`文字化けの疑い: ${pattern}（${note}）`)
  }
  return found
}

/**
 * 神名帳の本文をパースする。
 *
 * 国・郡の見出しを状態として持ち、以降の社行に引き継ぐ。
 * パースできなかった行は捨てずに unparsed に入れる（黙って落とさない）。
 */
export function parseShikinai(text: string): ShikinaiParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  const shrines: ParsedShrine[] = []
  const provinces: ParsedProvinceHeader[] = []
  const districts: ParsedDistrictHeader[] = []
  const unparsed: string[] = []

  let currentProvince = ''
  let currentDistrict = ''

  for (const line of lines) {
    if (isProvinceHeader(line)) {
      const p = parseProvinceHeader(line)
      if (p) {
        provinces.push(p)
        currentProvince = p.province
        currentDistrict = ''
        continue
      }
    }

    if (isDistrictHeader(line)) {
      const d = parseDistrictHeader(line)
      if (d) {
        districts.push(d)
        currentDistrict = d.district
        continue
      }
    }

    // 社の行か
    const hasNote = line.includes(NOTE_OPEN)
    if (!hasNote && !SHRINE_HINT.test(line)) {
      unparsed.push(line)
      continue
    }

    const split = splitNameAndNote(line)
    if (!split) {
      unparsed.push(line)
      continue
    }

    const attrs = parseNote(split.note)
    // 座数は社名側に書かれることもある（「川田神社二座」）
    const seatsFromName = parseSeats(split.name)
    const defects = detectDefects(line)

    // 社名から座数表記を取り除く
    const cleanName = split.name.replace(
      /[〇零一二三四五六七八九十百千壱壹弐貳貮参參肆伍陸柒漆捌玖拾佰陌仟阡0-9〓■]+座$/,
      '',
    )

    shrines.push({
      shrineName: cleanName || split.name,
      province: currentProvince,
      district: currentDistrict,
      rank: attrs.rank,
      offering: attrs.offering,
      offeringDetail: attrs.offeringDetail,
      tsukinami: attrs.tsukinami,
      niiname: attrs.niiname,
      ainame: attrs.ainame,
      seats: seatsFromName ?? attrs.seats ?? 1,
      rawNote: split.note,
      rawLine: line,
      hasDefect: defects.length > 0,
      defects,
    })
  }

  return {
    shrines,
    provinces,
    districts,
    unparsed,
    stats: {
      totalLines: lines.length,
      shrineLines: shrines.length,
      withDefect: shrines.filter((s) => s.hasDefect).length,
      rankUnknown: shrines.filter((s) => s.rank === null).length,
    },
  }
}

// ─────────────────────────────────────────────────────────
// 表示用の要約（§5.6.6 の型2「式内社の社格・祭祀から」）
// ─────────────────────────────────────────────────────────

const RANK_LABEL: Record<ShikinaiRank, string> = {
  myojin_tai: '名神大社',
  tai: '大社',
  sho: '小社',
}

/**
 * 割注から、推測を挟まずに言える事実だけの一文を作る。
 * これが典拠づけで最も強い型。
 *
 * 例: 「名神大社であり、月次祭・新嘗祭に預かる社として『延喜式』に記載されている。」
 */
export function describeShikinai(s: ParsedShrine): string {
  const where = s.province ? `${s.province}${s.district}の` : ''

  // 第1文: 何として記載されているか
  const head = s.rank
    ? `『延喜式』神名帳に、${where}「${RANK_LABEL[s.rank]}」として記載されている。`
    : `『延喜式』神名帳に、${where}「${s.shrineName}」として記載されている。`

  // 第2文: 幣帛と祭祀（原文の割注から読めた事実だけ）
  const clauses: string[] = []
  if (s.offering === 'kanpei') {
    clauses.push(
      s.offeringDetail === 'anjo'
        ? '案上官幣'
        : s.offeringDetail === 'ange'
          ? '案下官幣'
          : '官幣',
    )
  } else if (s.offering === 'kokuhei') {
    clauses.push('国幣')
  }

  const festivals: string[] = []
  if (s.tsukinami) festivals.push('月次祭')
  if (s.niiname) festivals.push('新嘗祭')
  if (s.ainame) festivals.push('相嘗祭')
  clauses.push(...festivals)

  const tail = clauses.length > 0 ? `${clauses.join('・')}に預かる。` : ''

  // 座数が2座以上なら事実として添える
  const seats = s.seats > 1 ? `${s.seats}座。` : ''

  return `${head}${tail}${seats}`
}
