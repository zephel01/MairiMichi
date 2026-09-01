/**
 * Wikipedia ページビューから「正月比」を求める。
 *
 * ★正月比 = 1月views ÷ 平常月(3,4,6,7月)viewsの中央値
 *   これが観光地と参拝地を分離する（実測）:
 *     明治神宮 2.85（参拝地） / 浅草寺 2.04 / 清水寺 1.16（純粋な観光地）
 *   そして規模の壁を越える:
 *     廣瀬大社 1.65 > 伏見稲荷 1.60（総viewsは1/10なのに上回る）
 *   = 「マイナーだが実際に参拝されている社」の検出器
 *
 * ★取得方法は2つ。件数で使い分ける。
 *   (a) 月次ダンプ  … 数百件以上ならこちら。1回落とせば全記事ぶん取れる
 *       https://dumps.wikimedia.org/other/pageview_complete/monthly/{YYYY}/{YYYY-MM}/pageviews-{YYYYMM}-user.bz2
 *       約4.7GB
 *   (b) REST API   … 数十件までの検証用。per-article はバッチ不可で、
 *       共有IPだと 429 が頻発する（実測: 10件に約8分）
 *
 * ライセンス: CC0 1.0（帰属表示すら不要）
 */

import type { MonthlyViews } from '@/core/priority'

// ─────────────────────────────────────────────────────────
// (a) 月次ダンプの行パーサ
// ─────────────────────────────────────────────────────────

/**
 * pageview_complete 月次ファイルの1行。
 *
 * ★形式は公式ドキュメント記載のものに従っている。
 *   実ダンプでの検証は未実施（この環境からダンプを取得できないため）。
 *   最初の1回は必ず assertDumpFormat() を通し、列数が合わない場合は
 *   落として目視すること。黙って誤パースするより落ちるほうがよい。
 *
 *   wiki_code  article_title  page_id  agent_type  monthly_total  hourly_counts
 *   例: ja.wikipedia 明治神宮 12345 user 18438 A1B2C3...
 */
export interface PageviewRow {
  wikiCode: string
  articleTitle: string
  pageId: string
  agentType: string
  monthlyTotal: number
}

export const EXPECTED_DUMP_COLUMNS = 6

export class DumpFormatError extends Error {
  constructor(line: string, actual: number) {
    super(
      `pageview ダンプの列数が想定と違います（期待 ${EXPECTED_DUMP_COLUMNS}、実際 ${actual}）。\n` +
        `形式が変わった可能性があります。行を目視してからパーサを直してください:\n  ${line.slice(0, 200)}`,
    )
    this.name = 'DumpFormatError'
  }
}

/**
 * 1行をパースする。対象外の行は null。
 * ★列数が想定と違えば例外を投げる（黙って誤パースしない）。
 */
export function parsePageviewLine(
  line: string,
  opts: { wikiCode?: string; agentType?: string } = {},
): PageviewRow | null {
  const trimmed = line.trim()
  if (trimmed.length === 0 || trimmed.startsWith('#')) return null

  const parts = trimmed.split(/\s+/)
  if (parts.length < EXPECTED_DUMP_COLUMNS - 1) {
    throw new DumpFormatError(line, parts.length)
  }

  const wikiCode = parts[0]!
  const wantWiki = opts.wikiCode ?? 'ja.wikipedia'
  if (wikiCode !== wantWiki) return null

  const agentType = parts[3]!
  const wantAgent = opts.agentType ?? 'user'
  if (agentType !== wantAgent) return null

  const total = Number(parts[4])
  if (!Number.isFinite(total)) return null

  return {
    wikiCode,
    articleTitle: parts[1]!,
    pageId: parts[2]!,
    agentType,
    monthlyTotal: total,
  }
}

/**
 * ダンプをストリームで走査し、対象記事のみ拾う。
 * 記事名はアンダースコア区切り（明治神宮のようなスペース無しの日本語はそのまま）。
 */
export async function scanPageviewDump(
  lines: AsyncIterable<string>,
  wantTitles: Set<string>,
  year: number,
  month: number,
  opts: { wikiCode?: string; agentType?: string } = {},
): Promise<Map<string, MonthlyViews>> {
  const out = new Map<string, MonthlyViews>()
  for await (const line of lines) {
    const row = parsePageviewLine(line, opts)
    if (!row) continue
    const title = row.articleTitle.replace(/_/g, ' ')
    if (!wantTitles.has(title) && !wantTitles.has(row.articleTitle)) continue
    const key = wantTitles.has(title) ? title : row.articleTitle
    out.set(key, { year, month, views: row.monthlyTotal })
  }
  return out
}

// ─────────────────────────────────────────────────────────
// (b) REST API クライアント（少数の検証用）
// ─────────────────────────────────────────────────────────

/**
 * ★User-Agent は必須。連絡先を含む固有UAでないとレート制限の対象になる。
 * ★共有IP環境では準拠UAでも 429 が頻発するので、6秒間隔＋指数バックオフを入れる。
 */
export interface PageviewApiOptions {
  userAgent: string
  /** リクエスト間隔[ms]。実測で6秒あれば400件完走できた */
  intervalMs?: number
  maxRetries?: number
  fetchImpl?: typeof fetch
  sleepImpl?: (ms: number) => Promise<void>
}

export function pageviewApiUrl(
  title: string,
  from: string,
  to: string,
  project = 'ja.wikipedia',
): string {
  const encoded = encodeURIComponent(title.replace(/ /g, '_'))
  return (
    `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/` +
    `${project}/all-access/user/${encoded}/monthly/${from}/${to}`
  )
}

interface ApiResponse {
  items?: Array<{ timestamp: string; views: number }>
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * 1記事ぶんの月次viewsを取る。
 * ★per-article はバッチ不可。数百件を超えるならダンプを使うこと。
 */
export async function fetchMonthlyViews(
  title: string,
  from: string,
  to: string,
  opts: PageviewApiOptions,
): Promise<MonthlyViews[]> {
  const doFetch = opts.fetchImpl ?? fetch
  const doSleep = opts.sleepImpl ?? sleep
  const maxRetries = opts.maxRetries ?? 3
  const url = pageviewApiUrl(title, from, to)

  let lastError: unknown = null
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // 指数バックオフ: 15s → 45s → 135s
      await doSleep(15_000 * 3 ** (attempt - 1))
    }
    try {
      const res = await doFetch(url, {
        headers: { 'User-Agent': opts.userAgent, Accept: 'application/json' },
      })
      if (res.status === 429) {
        lastError = new Error(`429 Too Many Requests: ${title}`)
        continue
      }
      if (res.status === 404) return [] // 記事が無い＝ページビュー0ではなく「データ無し」
      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}: ${title}`)
        continue
      }
      const json = (await res.json()) as ApiResponse
      return (json.items ?? []).map((it) => ({
        year: Number(it.timestamp.slice(0, 4)),
        month: Number(it.timestamp.slice(4, 6)),
        views: it.views,
      }))
    } catch (e) {
      lastError = e
    }
  }
  throw lastError ?? new Error(`pageview 取得に失敗: ${title}`)
}

/** 複数記事を間隔を空けて順に取る */
export async function fetchMonthlyViewsBatch(
  titles: string[],
  from: string,
  to: string,
  opts: PageviewApiOptions,
  onProgress?: (done: number, total: number, title: string) => void,
): Promise<Map<string, MonthlyViews[]>> {
  const doSleep = opts.sleepImpl ?? sleep
  const interval = opts.intervalMs ?? 6_000
  const out = new Map<string, MonthlyViews[]>()

  for (let i = 0; i < titles.length; i++) {
    const title = titles[i]!
    if (i > 0) await doSleep(interval)
    out.set(title, await fetchMonthlyViews(title, from, to, opts))
    onProgress?.(i + 1, titles.length, title)
  }
  return out
}

/** API の日付範囲文字列（YYYYMMDD00） */
export function monthRange(
  fromYear: number,
  fromMonth: number,
  toYear: number,
  toMonth: number,
): { from: string; to: string } {
  const p = (n: number) => String(n).padStart(2, '0')
  return {
    from: `${fromYear}${p(fromMonth)}0100`,
    to: `${toYear}${p(toMonth)}0100`,
  }
}
