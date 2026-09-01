/**
 * zh.wikisource ダンプから古典の本文を抽出する。
 *
 *   curl -O https://dumps.wikimedia.org/zhwikisource/latest/zhwikisource-latest-pages-articles.xml.bz2
 *   bzcat zhwikisource-latest-pages-articles.xml.bz2 \
 *     | npx tsx src/etl/classical/run-extract.ts --out ../etl-cache/classical
 *
 * 既定では Phase 1 に必要な古典（延喜式神名帳・風土記5か国・記紀・六国史）を取る。
 * --titles "A,B,C" で明示指定もできる。
 *
 * ★bz2 の展開は bzcat / lbzip2 に任せる（Node に bzip2 が無い）。
 * ★ダンプは数GBあるので、全体をメモリに載せずストリームで走査する。
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createReadStream } from 'node:fs'
import type { Readable } from 'node:stream'
import {
  extractPages,
  allClassicalTitles,
  extractBodyText,
} from './wikisource-dump'
import { parseArgs, log, fmtNum } from '../cli'

const USAGE = `
使い方:
  bzcat zhwikisource-latest-pages-articles.xml.bz2 | npx tsx src/etl/classical/run-extract.ts --out DIR
  npx tsx src/etl/classical/run-extract.ts --in dump.xml --out DIR

オプション:
  --out DIR       出力先ディレクトリ（必須）
  --in FILE       XMLファイルから読む（省略時は標準入力）
  --titles "A,B"  取り出すページタイトル（省略時は Phase 1 の古典一式）
`

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const outDir = typeof args['out'] === 'string' ? args['out'] : null
  if (!outDir) {
    console.error(USAGE)
    process.exit(1)
  }

  const titles =
    typeof args['titles'] === 'string'
      ? args['titles'].split(',').map((s) => s.trim()).filter(Boolean)
      : allClassicalTitles()

  const input: Readable =
    typeof args['in'] === 'string' ? createReadStream(args['in']) : process.stdin

  log(`${titles.length} ページを探します`)
  for (const t of titles) log(`  - ${t}`)

  const started = Date.now()
  const found = await extractPages(input, titles, (scanned, hit) => {
    log(`走査 ${fmtNum(scanned)} ページ / 発見 ${hit}`)
  })
  const elapsed = ((Date.now() - started) / 1000).toFixed(1)

  mkdirSync(outDir, { recursive: true })

  const manifest: Array<{ title: string; file: string; bytes: number }> = []
  for (const [title, page] of found) {
    const safe = title.replace(/[\/\\:*?"<>|]/g, '_')
    const body = extractBodyText(page.text)

    writeFileSync(join(outDir, `${safe}.raw.txt`), page.text, 'utf8')
    writeFileSync(join(outDir, `${safe}.txt`), body, 'utf8')

    manifest.push({ title, file: `${safe}.txt`, bytes: page.bytes })
    log(`保存: ${title} (${fmtNum(page.bytes)} bytes)`)
  }

  const missing = titles.filter((t) => !found.has(t))
  writeFileSync(
    join(outDir, 'manifest.json'),
    JSON.stringify(
      {
        extractedAt: new Date().toISOString(),
        source: 'zh.wikisource dump',
        rights: '原文はパブリックドメイン。校勘注は CC BY-SA 4.0',
        note: '.raw.txt は校勘注つきの原データ、.txt は注を落とした本文',
        pages: manifest,
        missing,
      },
      null,
      2,
    ),
    'utf8',
  )

  log(`完了: ${found.size}/${titles.length} ページ（${elapsed}秒）`)
  if (missing.length > 0) {
    log('★見つからなかったページ（タイトルの表記を確認してください）:')
    for (const t of missing) log(`  - ${t}`)
    process.exit(2)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
