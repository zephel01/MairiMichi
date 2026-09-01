/** ETL スクリプト共通の小道具 */

export interface Args {
  [key: string]: string | boolean | undefined
}

/** --key value / --flag 形式のパース */
export function parseArgs(argv: string[]): Args {
  const out: Args = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      out[key] = true
    } else {
      out[key] = next
      i++
    }
  }
  return out
}

export function requireArg(args: Args, key: string, usage: string): string {
  const v = args[key]
  if (typeof v !== 'string' || v.length === 0) {
    console.error(`--${key} が必要です\n\n${usage}`)
    process.exit(1)
  }
  return v
}

export function log(msg: string): void {
  console.error(`[etl] ${msg}`)
}

export function fmtNum(n: number): string {
  return n.toLocaleString('ja-JP')
}
