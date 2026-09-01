/**
 * ファイルシステムから data/*.yaml を読む（ETL・テスト用）。
 * ブラウザ側では使わない（Workers には事前生成したJSONを置く）。
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadMasterData, type MasterData, type RawSources } from './loaders'

/**
 * リポジトリルートの data/ ディレクトリを探す。
 * 実行元が app/ か リポジトリルートかで変わるので候補を順に試す。
 */
export function defaultDataDir(): string {
  const candidates = [
    // app/src/data/ から見て ../../../data
    import.meta.dirname ? join(import.meta.dirname, '..', '..', '..', 'data') : null,
    // app/ から実行（npm scripts）
    join(process.cwd(), '..', 'data'),
    // リポジトリルートから実行
    join(process.cwd(), 'data'),
  ].filter((p): p is string => p !== null)

  for (const dir of candidates) {
    if (existsSync(join(dir, 'benefits.yaml'))) return dir
  }
  throw new Error(
    `data/ ディレクトリが見つかりません。探した場所:\n${candidates.map((c) => `  ${c}`).join('\n')}`,
  )
}

export function readRawSources(dataDir = defaultDataDir()): RawSources {
  const read = (f: string) => readFileSync(join(dataDir, f), 'utf8')
  return {
    benefits: read('benefits.yaml'),
    deityClusters: read('deity_clusters.yaml'),
    clusterBenefits: read('cluster_benefits.yaml'),
    etiquetteOverrides: read('etiquette_overrides.yaml'),
    pilgrimageGroups: read('pilgrimage_groups.yaml'),
  }
}

export function loadMasterDataFromFs(dataDir = defaultDataDir()): MasterData {
  return loadMasterData(readRawSources(dataDir))
}
