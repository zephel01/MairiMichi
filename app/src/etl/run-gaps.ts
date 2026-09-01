/**
 * 穴の検出。
 *
 *   npx tsx src/etl/run-gaps.ts --sites ../etl-cache/sites.json --out ../_OUTPUTS/gaps_2026-09-01.md
 *
 * ★出力された一覧が、そのまま次の収録キューになる。
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { detectGaps, renderGapsMarkdown, type PilgrimageCoverage } from './gaps'
import { loadMasterDataFromFs } from '@/data/load-from-fs'
import type { Site } from '@/core/types'
import { parseArgs, log, fmtNum } from './cli'

const USAGE = `
使い方:
  npx tsx src/etl/run-gaps.ts --sites sites.json [--out gaps.md]

オプション:
  --sites FILE  収録済み社寺のJSON（Site[] または { sites: Site[] }）
  --out FILE    出力Markdown（省略時は標準出力）
`

function main() {
  const args = parseArgs(process.argv.slice(2))
  const sitesFile = typeof args['sites'] === 'string' ? args['sites'] : null
  if (!sitesFile) {
    console.error(USAGE)
    process.exit(1)
  }

  const master = loadMasterDataFromFs()
  const raw = JSON.parse(readFileSync(sitesFile, 'utf8')) as Site[] | { sites: Site[] }
  const sites: Site[] = Array.isArray(raw) ? raw : raw.sites
  log(`収録済み ${fmtNum(sites.length)} 社寺`)

  // 巡礼グループの収録率
  const coverage: PilgrimageCoverage[] = master.pilgrimages
    .filter((p) => p.totalCount)
    .map((p) => ({
      groupId: p.id,
      name: p.name,
      totalCount: p.totalCount!,
      registered: sites.filter((s) => s.groups.some((g) => g.groupId === p.id)).length,
    }))

  const majorIds = master.majors.map((m) => m.id)
  const gaps = detectGaps(sites, majorIds, coverage)
  const md = renderGapsMarkdown(gaps)

  const outFile = typeof args['out'] === 'string' ? args['out'] : null
  if (outFile) {
    mkdirSync(dirname(outFile), { recursive: true })
    writeFileSync(outFile, md, 'utf8')
    log(`出力: ${outFile}`)
  } else {
    console.log(md)
  }

  console.error('')
  console.error(`■ 検出した穴: ${fmtNum(gaps.length)} 件`)
  for (const kind of ['geography', 'benefit', 'access', 'goshuin', 'pilgrimage', 'etiquette'] as const) {
    const n = gaps.filter((g) => g.kind === kind).length
    if (n > 0) console.error(`  ${kind.padEnd(12)}: ${fmtNum(n)}`)
  }
}

main()
