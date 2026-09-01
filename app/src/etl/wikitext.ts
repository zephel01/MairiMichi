/**
 * ja.Wikipedia infobox から祭神・本尊などを抽出する。
 *
 * 対象テンプレート（実確認済み・設計書 §16.2）
 *   Template:神社       … パラメータ名は「祭神」。★「主祭神」は存在しない
 *   Template:日本の寺院 … 「本尊」「宗派」「宗旨」「札所等」
 *
 * ★実データの揺れ（神社400記事・寺院160記事の実測）
 *   祭神/本尊 非空          97.8% / 96.2%
 *   wikilink あり           76.2% / 88.3%
 *   パイプ付きリンク        41.2% / 14.9%   ← 表示名 ≠ 記事名
 *   リンクなし素テキスト    40.7%           ← 別名辞書によるあいまい一致が必須
 *   <br /> 区切り           38.9%
 *   括弧注記                10.7% / 20.1%
 *   入れ子テンプレート       3.1%
 *   相殿/配神の混在          0.8%
 *
 * ★最重要の実装知見
 *   [[イチキシマヒメ|市杵島姫命]] のようなパイプリンクは、
 *   「表示名」ではなく「リンク先記事名」を正規化キーに使う。
 *   これで表示名の揺れ 41.2% を無料で吸収できる。
 *
 * ★取れないもの
 *   相殿・配神が主祭神と区別なく同一フィールドに並ぶため、
 *   infobox から機械的に分離できない。role は多くが 'unknown' になる。
 *
 * 権利: Wikipedia 本文は CC BY-SA 4.0。
 *   「どの記事にリンクしているか」という事実だけを抜き、
 *   テキストそのものは再配布しない方針（設計書 §15.3）。
 */

import type { ExtractedDeity } from '@/core/types'

/** 相殿・配神を示す語。検出はするが分離は保証しない */
const AIDONO_MARKERS = ['相殿', '配神', '合祀', '摂社', '末社']

/**
 * infobox の1パラメータを取り出す。
 * ネストした {{ }} と [[ ]] を数えながら、トップレベルの | までを取る。
 */
export function extractInfoboxParam(
  wikitext: string,
  templateNames: string[],
  paramName: string,
): string | null {
  for (const tpl of templateNames) {
    const start = wikitext.indexOf(`{{${tpl}`)
    if (start < 0) continue

    // テンプレートの範囲を求める
    let depth = 0
    let end = -1
    for (let i = start; i < wikitext.length - 1; i++) {
      if (wikitext[i] === '{' && wikitext[i + 1] === '{') {
        depth++
        i++
      } else if (wikitext[i] === '}' && wikitext[i + 1] === '}') {
        depth--
        i++
        if (depth === 0) {
          end = i + 1
          break
        }
      }
    }
    if (end < 0) end = wikitext.length
    const body = wikitext.slice(start, end)

    // パラメータを探す
    const re = new RegExp(`\\|\\s*${paramName}\\s*=`, 'g')
    const m = re.exec(body)
    if (!m) continue

    let i = m.index + m[0].length
    let braceDepth = 0
    let bracketDepth = 0
    let out = ''
    while (i < body.length) {
      const ch = body[i]!
      const next = body[i + 1]
      if (ch === '{' && next === '{') {
        braceDepth++
        out += '{{'
        i += 2
        continue
      }
      if (ch === '}' && next === '}') {
        if (braceDepth === 0) break // テンプレート終端
        braceDepth--
        out += '}}'
        i += 2
        continue
      }
      if (ch === '[' && next === '[') {
        bracketDepth++
        out += '[['
        i += 2
        continue
      }
      if (ch === ']' && next === ']') {
        bracketDepth--
        out += ']]'
        i += 2
        continue
      }
      if (ch === '|' && braceDepth === 0 && bracketDepth === 0) break
      out += ch
      i++
    }
    const value = out.trim()
    return value.length > 0 ? value : null
  }
  return null
}

/** HTMLコメント・ref・efn を除去する */
export function stripAnnotations(s: string): string {
  return s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/\{\{efn\|[\s\S]*?\}\}/g, '')
    .replace(/\{\{sfn\|[\s\S]*?\}\}/g, '')
}

/**
 * <br> 各種と読点で分割する。
 * 中黒（・）は神名の中にも現れるため、リンクとリンクの間にあるときだけ区切る。
 *   [[豊臣秀吉]]・[[源頼朝]]  → 分割する
 *   八幡・住吉                → 分割しない（名前の一部かもしれない）
 */
export function splitEntries(s: string): string[] {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\]\]\s*[・･]\s*\[\[/g, ']]\n[[')
    .replace(/[、,]/g, '\n')
    .split('\n')
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
}

/**
 * 1エントリから祭神名を取り出す。
 * ★リンクがあればリンク先記事名を linkTarget にする。
 */
export function parseDeityEntry(entry: string): {
  display: string
  linkTarget: string | null
} | null {
  let s = entry.trim()
  if (s.length === 0) return null

  // {{wikidata|...|P825|...}} で祭神を Wikidata から引いている記事がある
  // （例: 伊勢神明社(静岡市)）。素朴な正規表現では取れないので、
  // ここでは検出だけして null を返し、Wikidata 側から取るよう促す。
  if (/\{\{\s*wikidata\s*\|/i.test(s)) return null

  const linkMatch = s.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/)
  if (linkMatch) {
    const target = linkMatch[1]!.trim()
    const display = (linkMatch[2] ?? linkMatch[1]!).trim()
    return { display, linkTarget: target }
  }

  // リンクなしの素テキスト（40.7%）。括弧注記と敬称を落とす
  s = s
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/(公|卿|命|尊|神|大神|大御神)?$/u, (m) => m) // 語尾は落とさない（別名辞書側で吸収）
    .replace(/^[（(]/, '')
    .trim()
  // 「ほか4柱の総称」「以下の2柱」のような曖昧表現は祭神名ではない
  if (/^(ほか|他|以下|など|等)/.test(s)) return null
  if (s.length === 0) return null
  return { display: s, linkTarget: null }
}

export interface ExtractedShrineInfo {
  deities: ExtractedDeity[]
  /** {{wikidata|...|P825}} 委譲を検出した。Wikidata 側から取ること */
  delegatedToWikidata: boolean
  /** 相殿・配神の語を検出した。role の分離は保証できない */
  hasAidonoMarker: boolean
  raw: string | null
}

/** Template:神社 の「祭神」から祭神を抽出する */
export function extractShrineDeities(wikitext: string): ExtractedShrineInfo {
  const raw = extractInfoboxParam(wikitext, ['神社'], '祭神')
  if (raw === null) {
    return { deities: [], delegatedToWikidata: false, hasAidonoMarker: false, raw: null }
  }

  const delegatedToWikidata = /\{\{\s*wikidata\s*\|/i.test(raw)
  const hasAidonoMarker = AIDONO_MARKERS.some((m) => raw.includes(m))

  const cleaned = stripAnnotations(raw)
  const deities: ExtractedDeity[] = []
  for (const entry of splitEntries(cleaned)) {
    const parsed = parseDeityEntry(entry)
    if (!parsed) continue
    // 相殿・配神の語そのものはスキップする
    if (AIDONO_MARKERS.some((m) => parsed.display === m)) continue
    deities.push({
      display: parsed.display,
      linkTarget: parsed.linkTarget,
      // ★infobox からは主祭神と相殿神を機械的に分離できない
      role: 'unknown',
      source: 'jawp',
    })
  }

  return { deities, delegatedToWikidata, hasAidonoMarker, raw }
}

export interface ExtractedTempleInfo {
  honzon: ExtractedDeity[]
  denomination: string | null
  /** 「四国八十八箇所」等。巡礼グループ機能の素材として最有用 */
  fudasho: string | null
  raw: string | null
}

/** Template:日本の寺院 の「本尊」「宗派」「札所等」を抽出する */
export function extractTempleInfo(wikitext: string): ExtractedTempleInfo {
  const tpl = ['日本の寺院']
  const raw = extractInfoboxParam(wikitext, tpl, '本尊')
  const denomination =
    extractInfoboxParam(wikitext, tpl, '宗派') ??
    extractInfoboxParam(wikitext, tpl, '宗旨')
  const fudasho = extractInfoboxParam(wikitext, tpl, '札所等')

  const honzon: ExtractedDeity[] = []
  if (raw !== null) {
    const cleaned = stripAnnotations(raw)
    for (const entry of splitEntries(cleaned)) {
      const parsed = parseDeityEntry(entry)
      if (!parsed) continue
      honzon.push({
        display: parsed.display,
        linkTarget: parsed.linkTarget,
        role: 'unknown',
        source: 'jawp',
      })
    }
  }

  return {
    honzon,
    denomination: denomination ? stripAnnotations(denomination).replace(/\[\[|\]\]/g, '').trim() : null,
    fudasho: fudasho ? stripAnnotations(fudasho).trim() : null,
    raw,
  }
}
