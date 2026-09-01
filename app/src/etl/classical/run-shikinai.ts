/**
 * 延喜式神名帳をパースして構造化データにする。
 *
 *   npx tsx src/etl/classical/run-shikinai.ts \
 *     --in ../etl-cache/classical/延喜式_卷第九.txt,../etl-cache/classical/延喜式_卷第十.txt \
 *     --out ../etl-cache/shikinai.json
 *
 * 出力に加えて、パース品質のレポートを標準エラーに出す。
 * ★unparsed（パースできなかった行）は必ず目視すること。
 *   国・郡の見出し形式は実本文の全パターンを確認できていないため、
 *   ここに大量に落ちていたら正規表現を調整する必要がある。
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { parseShikinai, describeShikinai, type ParsedShrine } from './shikinai'
import { parseArgs, log, fmtNum } from '../cli'

const USAGE = `
使い方:
  npx tsx src/etl/classical/run-shikinai.ts --in FILE[,FILE...] --out out.json

オプション:
  --in  FILES   神名帳の本文ファイル（カンマ区切り。巻九・巻十）
  --out FILE    出力JSON
  --report N    unparsed のサンプルを N 行表示（既定 30）
`

function main() {
  const args = parseArgs(process.argv.slice(2))
  const inArg = typeof args['in'] === 'string' ? args['in'] : null
  const outArg = typeof args['out'] === 'string' ? args['out'] : null
  if (!inArg || !outArg) {
    console.error(USAGE)
    process.exit(1)
  }
  const reportN = typeof args['report'] === 'string' ? Number(args['report']) : 30

  const files = inArg.split(',').map((s) => s.trim()).filter(Boolean)
  const allShrines: ParsedShrine[] = []
  const allUnparsed: string[] = []
  let totalLines = 0
  const provinces: string[] = []

  for (const f of files) {
    log(`読み込み: ${f}`)
    const text = readFileSync(f, 'utf8')
    const r = parseShikinai(text)
    allShrines.push(...r.shrines)
    allUnparsed.push(...r.unparsed)
    totalLines += r.stats.totalLines
    provinces.push(...r.provinces.map((p) => p.province))
    log(
      `  行 ${fmtNum(r.stats.totalLines)} / 社 ${fmtNum(r.stats.shrineLines)} / ` +
        `国 ${r.provinces.length} / 郡 ${r.districts.length} / 未パース ${fmtNum(r.unparsed.length)}`,
    )
  }

  // ── 品質レポート ──────────────────────────────
  const byRank = {
    myojin_tai: allShrines.filter((s) => s.rank === 'myojin_tai').length,
    tai: allShrines.filter((s) => s.rank === 'tai').length,
    sho: allShrines.filter((s) => s.rank === 'sho').length,
    unknown: allShrines.filter((s) => s.rank === null).length,
  }
  const totalSeats = allShrines.reduce((a, s) => a + s.seats, 0)
  const withDefect = allShrines.filter((s) => s.hasDefect).length

  console.error('')
  console.error('■ パース結果')
  console.error(`  社数        : ${fmtNum(allShrines.length)}`)
  console.error(`  座数合計    : ${fmtNum(totalSeats)}`)
  console.error(`  国          : ${new Set(provinces).size}`)
  console.error('')
  console.error('■ 社格の内訳')
  console.error(`  名神大      : ${fmtNum(byRank.myojin_tai)}`)
  console.error(`  大          : ${fmtNum(byRank.tai)}`)
  console.error(`  小          : ${fmtNum(byRank.sho)}`)
  console.error(`  読めず      : ${fmtNum(byRank.unknown)}`)
  console.error('')
  console.error('■ 祭祀')
  console.error(`  月次        : ${fmtNum(allShrines.filter((s) => s.tsukinami).length)}`)
  console.error(`  新嘗        : ${fmtNum(allShrines.filter((s) => s.niiname).length)}`)
  console.error(`  相嘗        : ${fmtNum(allShrines.filter((s) => s.ainame).length)}`)
  console.error('')
  console.error('■ 原文の欠字・文字化け')
  console.error(`  検出        : ${fmtNum(withDefect)} 件（原文を rawNote に保持しています）`)

  // ★神名帳の総数規定との突合。ずれていればパーサに問題がある
  console.error('')
  console.error('■ 神名帳の記載との突合（原文の総数規定）')
  console.error('  社 2,861処 / 大 492座 / 小 2,640座 ※原文に欠字あり')
  console.error(
    `  → パース結果: 社 ${fmtNum(allShrines.length)}処 / ` +
      `大(名神大含む) ${fmtNum(byRank.myojin_tai + byRank.tai)}座 / 小 ${fmtNum(byRank.sho)}座`,
  )
  const diff = Math.abs(allShrines.length - 2861)
  if (diff > 50) {
    console.error(
      `  ★社数が記載と ${fmtNum(diff)} ずれています。unparsed を確認してください`,
    )
  }

  if (allUnparsed.length > 0) {
    console.error('')
    console.error(`■ 未パース行のサンプル（全 ${fmtNum(allUnparsed.length)} 行）`)
    console.error('  ★国・郡の見出し形式は全パターン未確認です。ここを必ず目視してください')
    for (const l of allUnparsed.slice(0, reportN)) console.error(`  ${l}`)
    if (allUnparsed.length > reportN) console.error(`  ... 他 ${fmtNum(allUnparsed.length - reportN)} 行`)
  }

  // ── 出力 ──────────────────────────────────────
  mkdirSync(dirname(outArg), { recursive: true })
  writeFileSync(
    outArg,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: '延喜式 巻第九・巻第十（神名帳）',
        sourceUrl: 'https://zh.wikisource.org/wiki/延喜式/卷第九',
        rights: '原文はパブリックドメイン',
        stats: { totalLines, shrines: allShrines.length, totalSeats, byRank, withDefect },
        shrines: allShrines.map((s) => ({
          ...s,
          // 推測を挟まずに言える事実だけの一文（典拠づけの型2）
          description: describeShikinai(s),
        })),
        unparsed: allUnparsed,
      },
      null,
      2,
    ),
    'utf8',
  )
  log(`出力: ${outArg}`)
}

main()
