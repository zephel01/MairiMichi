import 'server-only'
import { loadMasterDataFromFs } from './load-from-fs'
import type { MasterData } from './loaders'

/**
 * サーバ側でマスタを1回だけ読む。
 *
 * ★Cloudflare Workers には node:fs が無い。
 *   本番では ETL が生成した JSON を D1 / 静的アセットから読む形に差し替える。
 *   （Phase 1e の実装時に etl/09_emit.ts の出力を使う）
 */
let cached: MasterData | null = null

export function getMaster(): MasterData {
  if (!cached) cached = loadMasterDataFromFs()
  return cached
}
