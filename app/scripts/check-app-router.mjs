/**
 * App Router のディレクトリが1つに定まっているかを確認する。
 *
 * ★なぜ要るか（実際に踏んだ）
 *   Next.js は App Router を `./app` と `./src/app` の両方で探し、
 *   **`./app` があればそちらを優先する**。
 *   そのため `./app` が空のまま存在すると、`./src/app` に全ページがあっても
 *   ルートがゼロ件と判定され、pages router にフォールバックして
 *   `Route (pages) ─ ○ /404` だけのサイトが**エラーも警告も無く**ビルドされる。
 *
 *   ビルドは成功扱いなので気付きにくい。ここで落とす。
 */

import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = dirname(dirname(fileURLToPath(import.meta.url))) // scripts/ の親

const rootApp = join(appRoot, 'app')
const srcApp = join(appRoot, 'src', 'app')

const hasRootApp = existsSync(rootApp) && statSync(rootApp).isDirectory()
const hasSrcApp = existsSync(srcApp) && statSync(srcApp).isDirectory()

/** そのディレクトリがルートを1つでも持っているか */
function hasRoutes(dir) {
  if (!existsSync(dir)) return false
  const stack = [dir]
  while (stack.length > 0) {
    const cur = stack.pop()
    for (const e of readdirSync(cur, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue
      if (e.isDirectory()) {
        stack.push(join(cur, e.name))
      } else if (/^(page|route|layout)\.(tsx?|jsx?|mjs)$/.test(e.name)) {
        return true
      }
    }
  }
  return false
}

const problems = []

if (hasRootApp && hasSrcApp) {
  problems.push(
    `App Router のディレクトリが2つあります:\n` +
      `    ${rootApp}\n` +
      `    ${srcApp}\n` +
      `  Next.js は ./app を優先するため、src/app のページは無視されます。`,
  )
} else if (hasRootApp && !hasRoutes(rootApp)) {
  problems.push(
    `${rootApp} が空です。\n` +
      `  Next.js はここを App Router と認識し、ルート0件として pages router に\n` +
      `  フォールバックします（/404 だけのサイトになります）。`,
  )
} else if (!hasRootApp && !hasSrcApp) {
  problems.push('App Router のディレクトリ（./app または ./src/app）が見つかりません。')
} else if (hasSrcApp && !hasRoutes(srcApp)) {
  problems.push(`${srcApp} に page/route/layout がありません。`)
}

if (problems.length > 0) {
  console.error('')
  console.error('✖ App Router の構成が壊れています')
  console.error('')
  for (const p of problems) console.error('  ' + p)
  console.error('')
  if (hasRootApp && hasSrcApp) {
    console.error('  対処: 中身のない ./app を削除してください')
    console.error('    rmdir app')
  } else if (hasRootApp) {
    console.error('  対処:')
    console.error('    rmdir app        # 空なら削除')
  }
  console.error('')
  process.exit(1)
}

console.error(`[check] App Router: ${hasRootApp ? './app' : './src/app'} ✓`)
