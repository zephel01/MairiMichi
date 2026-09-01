/**
 * マスタデータ（data/*.yaml）を検証する。
 *
 *   npm run etl:validate
 *
 * ★エラーが1件でもあれば exit 1。CI でこれを走らせれば、
 *   YAML のタイプミスで導出が静かに壊れるのを防げる。
 */

import { loadMasterDataFromFs } from '@/data/load-from-fs'
import { renderIssues, MasterDataError } from '@/data/loaders'
import { parseArgs, log, fmtNum } from './cli'

function main() {
  const args = parseArgs(process.argv.slice(2))
  const dataDir = typeof args['data'] === 'string' ? args['data'] : undefined

  try {
    const master = dataDir ? loadMasterDataFromFs(dataDir) : loadMasterDataFromFs()
    console.log(renderIssues(master.issues))
    console.log('')
    console.log('■ 読み込んだマスタ')
    console.log(`  大分類            : ${master.majors.length}`)
    console.log(
      `  細分類            : ${fmtNum(master.majors.reduce((a, m) => a + m.minors.length, 0))}`,
    )
    console.log(`  神格クラスタ      : ${master.clusters.length}`)
    console.log(`  御利益の割り当て  : ${master.clusterBenefits.size}`)
    console.log(`  作法の例外        : ${master.etiquetteOverrides.size}`)
    console.log(`  宗派ルール        : ${master.denominationRules.length}`)
    console.log(`  巡礼グループ      : ${master.pilgrimages.length}`)

    // 御利益が付かないクラスタの内訳
    const noMapping = [...master.clusterBenefits.values()].filter(
      (c) => c.policy === 'NO_AUTO_MAPPING',
    )
    const noBenefit = [...master.clusterBenefits.values()].filter(
      (c) => c.policy === 'NO_CURRENT_BENEFIT',
    )
    if (noMapping.length > 0 || noBenefit.length > 0) {
      console.log('')
      console.log('■ 意図的に御利益を出さないクラスタ')
      for (const c of noMapping) console.log(`  ${c.cluster}: 定型マッピングなし（人物神など）`)
      for (const c of noBenefit) console.log(`  ${c.cluster}: 現世利益に落ちない`)
    }

    const warnings = master.issues.filter((i) => i.severity === 'warning')
    if (warnings.length > 0) {
      log(`警告 ${warnings.length} 件（エラーではないので処理は続行できます）`)
    }
    process.exit(0)
  } catch (e) {
    if (e instanceof MasterDataError) {
      console.error(renderIssues(e.issues))
      console.error('')
      console.error('★エラーがあるとマスタを読み込めません。上の指摘を直してください。')
      process.exit(1)
    }
    throw e
  }
}

main()
