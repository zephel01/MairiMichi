/**
 * Wikisource ダンプから特定ページの本文を取り出す。
 *
 * ★なぜ API ではなくダンプか
 *   zh.wikisource の API はレート制限が厳しく 429 が頻発する（実測）。
 *   Wikimedia は 2026年3〜4月に新しいグローバルAPIレート制限を導入済み。
 *
 * ★なぜ zh（中国語版）か
 *   ja.wikisource に古事記・日本書紀・延喜式の本文は存在しない。
 *   版一覧のスタブのみで、「古事記 (原文)」「出雲国風土記」「日本三代実録」は404。
 *   本文は全て zh.wikisource にある（漢文原文なので当然）。
 *
 * 使い方（bz2 の展開は外部コマンドに任せる。Node に bzip2 が無いため）:
 *
 *   curl -O https://dumps.wikimedia.org/zhwikisource/latest/zhwikisource-latest-pages-articles.xml.bz2
 *   bzcat zhwikisource-latest-pages-articles.xml.bz2 \
 *     | node --experimental-strip-types src/etl/classical/run-extract.ts \
 *         --titles "延喜式/卷第九,延喜式/卷第十,古風土記/出雲國風土記" \
 *         --out etl-cache/classical
 */

import { createInterface } from 'node:readline'
import type { Readable } from 'node:stream'

export interface ExtractedPage {
  title: string
  text: string
  bytes: number
}

/** MediaWiki の XML エスケープを戻す */
export function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/**
 * pages-articles XML をストリームで走査し、指定タイトルの本文を返す。
 *
 * ダンプは数GB あるので、全体をメモリに載せない。
 * <page> の中に入ったときだけバッファリングし、対象外なら即捨てる。
 */
export async function extractPages(
  stream: Readable,
  titles: string[],
  onProgress?: (scanned: number, found: number) => void,
): Promise<Map<string, ExtractedPage>> {
  const want = new Set(titles)
  const found = new Map<string, ExtractedPage>()

  const rl = createInterface({ input: stream, crlfDelay: Infinity })

  let inPage = false
  let currentTitle: string | null = null
  let interested = false
  let inText = false
  let buf: string[] = []
  let scanned = 0

  for await (const line of rl) {
    if (!inPage) {
      if (line.includes('<page>')) {
        inPage = true
        currentTitle = null
        interested = false
        inText = false
        buf = []
      }
      continue
    }

    if (currentTitle === null) {
      const m = line.match(/<title>([\s\S]*?)<\/title>/)
      if (m?.[1] !== undefined) {
        currentTitle = unescapeXml(m[1])
        scanned++
        interested = want.has(currentTitle)
        if (onProgress && scanned % 100_000 === 0) onProgress(scanned, found.size)
        // 対象外のページはここで打ち切る（本文をバッファしない）
        if (!interested) {
          inPage = false
        }
      }
      continue
    }

    if (!inText) {
      const open = line.indexOf('<text')
      if (open >= 0) {
        const gt = line.indexOf('>', open)
        if (gt >= 0) {
          const close = line.indexOf('</text>', gt)
          if (close >= 0) {
            // 1行で完結
            buf.push(line.slice(gt + 1, close))
            finish()
            continue
          }
          buf.push(line.slice(gt + 1))
          inText = true
        }
      }
      if (line.includes('</page>')) {
        inPage = false
      }
      continue
    }

    const close = line.indexOf('</text>')
    if (close >= 0) {
      buf.push(line.slice(0, close))
      finish()
      continue
    }
    buf.push(line)
  }

  function finish() {
    if (currentTitle !== null && interested) {
      const text = unescapeXml(buf.join('\n'))
      found.set(currentTitle, {
        title: currentTitle,
        text,
        bytes: Buffer.byteLength(text, 'utf8'),
      })
    }
    inPage = false
    inText = false
    buf = []
  }

  return found
}

/**
 * Phase 1 で必要な古典のページタイトル。
 * ★すべて zh.wikisource で実在を確認済み。
 */
export const CLASSICAL_TITLES = {
  /** 延喜式 神名帳。式内社2,861社が社格・官幣国幣・月次新嘗相嘗つきで入っている */
  engishiki: ['延喜式/卷第九', '延喜式/卷第十'],
  /** 風土記。現存5か国すべて。地名起源譚・鎮座譚 */
  fudoki: [
    '古風土記/出雲國風土記',
    '古風土記/常陸國風土記',
    '古風土記/播磨國風土記',
    '古風土記/肥前國風土記',
    '古風土記/豐後國風土記',
  ],
  /** 記紀。祭神の神話上の事績 */
  kiki: ['古事記', '日本書紀'],
  /** 六国史。神階の叙位記事 */
  rikkokushi: [
    '日本書紀',
    '續日本紀',
    '日本後紀',
    '續日本後紀',
    '日本文德天皇實錄',
    '日本三代實錄',
  ],
} as const

export function allClassicalTitles(): string[] {
  return [...new Set(Object.values(CLASSICAL_TITLES).flat())]
}

// ─────────────────────────────────────────────────────────
// 校勘注の除去（原文だけを使えば PD 素材の利用になる）
// ─────────────────────────────────────────────────────────

/**
 * Wikisource 編集者による校勘注を落とし、原文だけを残す。
 *
 * ★ライセンス上の意味
 *   底本の漢文は千年以上前の著作物でパブリックドメイン。
 *   CC BY-SA 4.0 がかかるのは編集者が付けた句読・校勘注・異体字併記。
 *   注を落として原文だけを使えば、法的には PD 素材の利用となり継承義務が発生しない。
 *   （注ごと使う場合は CC BY-SA 表示をすること）
 */
export function stripWikisourceAnnotations(text: string): string {
  return (
    text
      // {{另|効|敷/敦}} 異体字・異本併記マーカー → 第1候補を残す
      .replace(/\{\{\s*另\s*\|([^|}]*)\|[^}]*\}\}/g, '$1')
      // <ref>...</ref> 校異注
      .replace(/<ref[^>]*\/>/g, '')
      .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
      // <!-- --> コメント
      .replace(/<!--[\s\S]*?-->/g, '')
      // ページ番号テンプレート
      .replace(/\{\{\s*(?:page|頁|ページ)[^}]*\}\}/gi, '')
      // 見出しの = = は残す（構造情報なので）
      .replace(/[ \t]+$/gm, '')
  )
}

/** ヘッダ・ナビゲーションのテンプレートを落として本文だけにする */
export function extractBodyText(wikitext: string): string {
  let s = stripWikisourceAnnotations(wikitext)
  // 冒頭のナビゲーション用テンプレート群を落とす
  s = s.replace(/^\s*\{\{[^}]*\}\}\s*$/gm, '')
  // カテゴリ
  s = s.replace(/\[\[Category:[^\]]*\]\]/gi, '')
  s = s.replace(/\[\[分类:[^\]]*\]\]/g, '')
  return s.replace(/\n{3,}/g, '\n\n').trim()
}
