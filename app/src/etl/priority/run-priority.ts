/**
 * 収録優先度（正月比）を計算する。
 *
 * ★このスコアは内部の作業順であって、ユーザーに見せる順位ではない。
 *   出力は etl-cache/ に置き、D1 には流し込まない。
 *
 * 使い方（2通り）
 *
 * (a) 月次ダンプから（数百件以上ならこちら）
 *     for m in 202601 202603 202604 202606 202607; do
 *       curl -O "https://dumps.wikimedia.org/other/pageview_complete/monthly/${m:0:4}/${m:0:4}-${m:4:2}/pageviews-${m}-user.bz2"
 *     done
 *     npx tsx src/etl/priority/run-priority.ts \
 *       --titles ../data/phase1_titles.txt \
 *       --dumps "pageviews-202601-user.bz2:2026:1,pageviews-202603-user.bz2:2026:3,..." \
 *       --out ../etl-cache/priority.json
 *
 * (b) REST API から（数十件までの検証用）
 *     npx tsx src/etl/priority/run-priority.ts \
 *       --titles ../data/phase1_titles.txt --api \
 *       --ua "mairimichi/0.1 (https://github.com/zephel01/MairiMichi; you@example.com)" \
 *       --out ../etl-cache/priority.json
 */

import { readFileSync, writeFileSync, mkdirSync, createReadStream } from 'node:fs'
import { dirname } from 'node:path'
import { createInterface } from 'node:readline'
import { spawn } from 'node:child_process'
import {
  computeNewYearRatio,
  computeRanges,
  buildPriority,
  type MonthlyViews,
  type PriorityInput,
} from '@/core/priority'
import {
  scanPageviewDump,
  fetchMonthlyViewsBatch,
  monthRange,
} from './pageviews'
import { parseArgs, log, fmtNum } from '../cli'

const USAGE = `
使い方:
  npx tsx src/etl/priority/run-priority.ts --titles FILE --out OUT.json [--api --ua "..."] [--dumps "file:year:month,..."]

オプション:
  --titles FILE  1行1記事名のテキストファイル
  --out FILE     出力JSON
  --dumps LIST   月次ダンプ "path:year:month" のカンマ区切り（.bz2 は bzcat 経由で読む）
  --api          REST API から取る（数十件まで）
  --ua STRING    User-Agent（--api のとき必須。連絡先を含めること）
  --from YYYYMM  API の開始月（既定 202512）
  --to   YYYYMM  API の終了月（既定 202607）
`

/** .bz2 なら bzcat を通し、それ以外はそのまま読む */
function openLines(path: string): AsyncIterable<string> {
  if (path.endsWith('.bz2')) {
    const proc = spawn('bzcat', [path], { stdio: ['ignore', 'pipe', 'inherit'] })
    return createInterface({ input: proc.stdout, crlfDelay: Infinity })
  }
  return createInterface({ input: createReadStream(path), crlfDelay: Infinity })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const titlesFile = typeof args['titles'] === 'string' ? args['titles'] : null
  const outFile = typeof args['out'] === 'string' ? args['out'] : null
  if (!titlesFile || !outFile) {
    console.error(USAGE)
    process.exit(1)
  }

  const titles = readFileSync(titlesFile, 'utf8')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('#'))
  log(`対象 ${fmtNum(titles.length)} 記事`)

  const viewsByTitle = new Map<string, MonthlyViews[]>()
  const push = (title: string, v: MonthlyViews) => {
    const arr = viewsByTitle.get(title) ?? []
    arr.push(v)
    viewsByTitle.set(title, arr)
  }

  if (args['api']) {
    const ua = typeof args['ua'] === 'string' ? args['ua'] : null
    if (!ua) {
      console.error('★--api には --ua が必須です。汎用UAはレート制限の対象になります。')
      process.exit(1)
    }
    if (titles.length > 200) {
      log(`★${titles.length} 件を API で取るのは非現実的です（6秒間隔で約 ${Math.ceil((titles.length * 6) / 60)} 分）。ダンプを使ってください`)
    }
    const from = typeof args['from'] === 'string' ? args['from'] : '202512'
    const to = typeof args['to'] === 'string' ? args['to'] : '202607'
    const range = monthRange(
      Number(from.slice(0, 4)),
      Number(from.slice(4, 6)),
      Number(to.slice(0, 4)),
      Number(to.slice(4, 6)),
    )
    const result = await fetchMonthlyViewsBatch(titles, range.from, range.to, { userAgent: ua }, (done, total, title) =>
      log(`  ${done}/${total} ${title}`),
    )
    for (const [t, rows] of result) viewsByTitle.set(t, rows)
  } else {
    const dumps = typeof args['dumps'] === 'string' ? args['dumps'] : null
    if (!dumps) {
      console.error('--dumps か --api のどちらかが必要です\n' + USAGE)
      process.exit(1)
    }
    const want = new Set(titles)
    for (const spec of dumps.split(',')) {
      const [path, y, m] = spec.split(':')
      if (!path || !y || !m) {
        console.error(`--dumps の形式が不正です: "${spec}"（path:year:month）`)
        process.exit(1)
      }
      log(`走査: ${path} (${y}-${m})`)
      const found = await scanPageviewDump(openLines(path), want, Number(y), Number(m))
      log(`  ヒット ${fmtNum(found.size)} / ${fmtNum(titles.length)}`)
      for (const [t, v] of found) push(t, v)
    }
  }

  // ── 正月比を計算 ──────────────────────────────
  const now = new Date()
  const inputs: PriorityInput[] = titles.map((title) => {
    const rows = viewsByTitle.get(title) ?? []
    const m = computeNewYearRatio(rows, now)
    return {
      siteId: title,
      pvBaseMedian: m.pvBaseMedian,
      pvJanuary: m.pvJanuary,
      newYearRatio: m.newYearRatio,
      officialVisitors: null, // 都道府県 観光入込客統計は別途 p2 で入れる
      sitelinks: null,
      hasGoshuin: false,
      hasWikipediaArticle: rows.length > 0,
      nearbyPopulation: null,
    }
  })

  const ranges = computeRanges(inputs)
  const priorities = inputs
    .map((i) => buildPriority(i, ranges, now))
    .sort((a, b) => b.score - a.score)

  const withRatio = priorities.filter((p) => p.newYearRatio !== null)
  const noArticle = priorities.filter((p) => !p.hasWikipediaArticle)

  console.error('')
  console.error('■ 収録優先度')
  console.error(`  対象            : ${fmtNum(priorities.length)}`)
  console.error(`  正月比が出た社  : ${fmtNum(withRatio.length)}`)
  console.error(`  記事が無い社    : ${fmtNum(noArticle.length)} ★別系統の優先度が必要`)
  console.error('')
  console.error('■ 正月比 上位20（参拝地の指標。観光地は低く出る）')
  for (const p of [...withRatio].sort((a, b) => b.newYearRatio! - a.newYearRatio!).slice(0, 20)) {
    console.error(
      `  ${p.newYearRatio!.toFixed(2).padStart(5)}  ${p.siteId}` +
        `  (平常月 ${fmtNum(p.pvBaseMedian ?? 0)} / 1月 ${fmtNum(p.pvJanuary ?? 0)})`,
    )
  }
  console.error('')
  console.error('■ 正月比 下位10（観光地の可能性。参拝先としては優先度が下がる）')
  for (const p of [...withRatio].sort((a, b) => a.newYearRatio! - b.newYearRatio!).slice(0, 10)) {
    console.error(`  ${p.newYearRatio!.toFixed(2).padStart(5)}  ${p.siteId}`)
  }

  mkdirSync(dirname(outFile), { recursive: true })
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        generatedAt: now.toISOString(),
        note: '★収録優先度は内部の作業順。D1 の公開テーブルにも API にも載せないこと',
        source: 'Wikipedia pageviews (CC0)',
        baseMonths: [3, 4, 6, 7],
        excludedCurrentMonth: `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`,
        priorities,
      },
      null,
      2,
    ),
    'utf8',
  )
  log(`出力: ${outFile}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
