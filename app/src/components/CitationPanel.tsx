import type { ClassicalSource, SiteCitation, SiteLore } from '@/core/types'

/**
 * 典拠の表示（設計書 §5.6.7）。
 *
 * ★層のラベルを視覚的に区別する。
 *   「一次史料にこう書いてある（第1層）」
 *   「後世こう解釈された（第3層）」
 *   「編集部の見解（第4層）」
 *   を混ぜると、推測と出典の区別が付かなくなる。
 *
 * ★古典の原文はパブリックドメイン。そのまま掲載してよい。
 *   Wikisource の校勘注は CC BY-SA なので、原文だけを載せている。
 */

const LAYER_LABEL: Record<1 | 2 | 3, { label: string; className: string }> = {
  1: { label: '一次史料', className: 'bg-stone-800 text-white' },
  2: { label: '読み下し・現代語', className: 'bg-stone-500 text-white' },
  3: { label: '近代の記録', className: 'bg-stone-300 text-stone-900' },
}

export function LayerBadge({ layer }: { layer: 1 | 2 | 3 }) {
  const l = LAYER_LABEL[layer]
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] ${l.className}`}>{l.label}</span>
  )
}

export function CitationPanel({
  citations,
  sources,
}: {
  citations: SiteCitation[]
  sources: Map<string, ClassicalSource>
}) {
  if (citations.length === 0) {
    return (
      <p className="text-sm text-neutral-600">
        この社寺については、一次史料の記載をまだ確認できていません。
      </p>
    )
  }

  const sorted = [...citations].sort((a, b) => a.layer - b.layer)

  return (
    <div className="space-y-4">
      {sorted.map((c) => {
        const src = sources.get(c.classicalSourceId)
        if (!src) return null
        return (
          <article key={`${c.classicalSourceId}-${c.layer}`} className="border-l-2 border-stone-300 pl-3">
            <div className="flex flex-wrap items-center gap-2">
              <LayerBadge layer={c.layer} />
              <span className="text-sm font-medium">
                {src.title}
                {src.volume ? ` ${src.volume}` : ''}
                {src.section ? `・${src.section}` : ''}
              </span>
            </div>

            {/* 原文（パブリックドメイン） */}
            <blockquote className="mt-1 whitespace-pre-wrap break-words font-serif text-sm leading-relaxed text-neutral-900">
              {src.originalText}
            </blockquote>

            {src.reading && (
              <p className="mt-1 text-sm text-neutral-700">{src.reading}</p>
            )}
            {src.modernJa && (
              <p className="mt-1 text-sm text-neutral-700">{src.modernJa}</p>
            )}

            {/* ★第4層。編集部の接続であることを明示する */}
            {c.editorNote && (
              <p className="mt-2 rounded bg-amber-50 p-2 text-sm text-neutral-800">
                <span className="mr-1 rounded bg-amber-200 px-1.5 py-0.5 text-[11px]">
                  編集部
                </span>
                {c.editorNote}
              </p>
            )}

            <p className="mt-1 text-xs text-neutral-500">
              出典:{' '}
              <a href={src.sourceUrl} className="underline" rel="noopener">
                {src.title}
              </a>
              {src.rights === 'PD' && '（原文はパブリックドメイン）'}
              {src.rights === 'CC-BY-SA-4.0' && '（CC BY-SA 4.0）'}
              {src.rights === 'PD+CC-BY-SA-4.0' && '（原文はPD／注は CC BY-SA 4.0）'}
              {c.ocrWarning && (
                <span className="ml-1 text-neutral-600">
                  ※OCRテキストのため誤りを含む場合があります
                </span>
              )}
            </p>
          </article>
        )
      })}
    </div>
  )
}

/**
 * 層C1: 社伝・公式の言説。
 * ★出典URLが無いレコードは表示しない（そもそもデータに入らない設計）。
 */
export function LorePanel({ lore }: { lore: SiteLore[] }) {
  const withSource = lore.filter((l) => l.sourceUrl)
  if (withSource.length === 0) return null

  return (
    <ul className="space-y-2">
      {withSource.map((l, i) => (
        <li key={i} className="text-sm">
          <p className="text-neutral-800">{l.text}</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            出典:{' '}
            <a href={l.sourceUrl} className="underline" rel="noopener">
              {l.sourceName}
            </a>
            {l.verifiedAt && `（${l.verifiedAt} 確認）`}
          </p>
        </li>
      ))}
    </ul>
  )
}
