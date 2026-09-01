import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getMaster } from '@/data/master'
import { SAMPLE_SITES } from '@/data/sample-sites'
import { AccessBadge } from '@/components/AccessBadge'
import { ConfidenceBadge } from '@/components/BenefitList'
import { isReachableWithoutCar, ACCESS_SORT_ORDER } from '@/core/access'
import type { BenefitMajorId, Site } from '@/core/types'

/**
 * 御利益から探す一覧。
 *
 * ★並べ替えは「目的への適合順」のみ（§9.2-a）。
 *   良さの順位は付けない。人気順も作らない。
 * ★絞り込みは既定で primary のみ（§5.4）。
 *   secondary まで含めると全社寺が全カテゴリに該当して機能しない。
 */

export function generateStaticParams() {
  return getMaster().majors.map((m) => ({ major: m.id }))
}

function matches(site: Site, majorId: BenefitMajorId, includeRelated: boolean): boolean {
  return site.benefits.some(
    (b) => b.majorId === majorId && (includeRelated || b.weight === 'primary'),
  )
}

export default async function BenefitPage({
  params,
  searchParams,
}: {
  params: Promise<{ major: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { major } = await params
  const sp = await searchParams
  const master = getMaster()
  const majorDef = master.majors.find((m) => m.id === major)
  if (!majorDef) notFound()

  const includeRelated = sp['related'] === '1'
  const carFreeOnly = sp['carfree'] === '1'
  const includeUnknown = sp['unknown'] === '1'

  let sites = SAMPLE_SITES.filter((s) => matches(s, majorDef.id, includeRelated))
  if (carFreeOnly) {
    sites = sites.filter(
      (s) => s.access && isReachableWithoutCar(s.access.accessMode, includeUnknown),
    )
  }
  // 目的への適合順: 公共交通で行きやすい順 → 徒歩負荷の軽い順
  const loadOrder = { EASY: 0, MODERATE: 1, HARD: 2 }
  sites = [...sites].sort((a, b) => {
    const am = a.access ? ACCESS_SORT_ORDER[a.access.accessMode] : 9
    const bm = b.access ? ACCESS_SORT_ORDER[b.access.accessMode] : 9
    if (am !== bm) return am - bm
    const al = a.access ? loadOrder[a.access.walkLoad] : 9
    const bl = b.access ? loadOrder[b.access.walkLoad] : 9
    return al - bl
  })

  const qs = (over: Record<string, string | null>) => {
    const p = new URLSearchParams()
    const cur: Record<string, string | null> = {
      related: includeRelated ? '1' : null,
      carfree: carFreeOnly ? '1' : null,
      unknown: includeUnknown ? '1' : null,
      ...over,
    }
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v)
    const s = p.toString()
    return s ? `?${s}` : ''
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/" className="text-sm underline">
        ← 願いを選び直す
      </Link>
      <h1 className="mt-3 text-2xl font-bold">{majorDef.label}</h1>
      <p className="mt-1 text-sm text-neutral-600">
        {majorDef.minors.map((m) => m.label).join('・')}
      </p>

      {/* 絞り込み。★「良い順」ではなくユーザーの条件 */}
      <div className="mt-5 flex flex-wrap gap-2 text-sm">
        <Link
          href={`/benefits/${major}${qs({ carfree: carFreeOnly ? null : '1' })}`}
          className={`rounded border px-3 py-1 ${carFreeOnly ? 'bg-neutral-900 text-white' : ''}`}
        >
          車なしで行ける
        </Link>
        {carFreeOnly && (
          <Link
            href={`/benefits/${major}${qs({ unknown: includeUnknown ? null : '1' })}`}
            className={`rounded border px-3 py-1 ${includeUnknown ? 'bg-neutral-900 text-white' : ''}`}
          >
            判定不能も含める
          </Link>
        )}
        <Link
          href={`/benefits/${major}${qs({ related: includeRelated ? null : '1' })}`}
          className={`rounded border px-3 py-1 ${includeRelated ? 'bg-neutral-900 text-white' : ''}`}
        >
          関連するご利益も含める
        </Link>
      </div>

      <p className="mt-3 text-xs text-neutral-600">
        並び順は「公共交通で行きやすい順 → 徒歩の負担が軽い順」です。
        当サイトは社寺に順位や点数を付けません。
      </p>

      <ul className="mt-6 space-y-4">
        {sites.map((s) => {
          const hit = s.benefits.filter(
            (b) => b.majorId === majorDef.id && (includeRelated || b.weight === 'primary'),
          )
          return (
            <li key={s.id} className="rounded border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/sites/${s.id}`} className="font-medium underline">
                  {s.name}
                </Link>
                <AccessBadge access={s.access} />
              </div>
              {s.address && (
                <p className="mt-1 text-xs text-neutral-600">{s.address}</p>
              )}
              <ul className="mt-2 space-y-1">
                {hit.map((b) => (
                  <li key={b.benefitId} className="text-sm">
                    <span className="mr-2">
                      {master.taxonomy.labelOf.get(b.benefitId) ?? b.benefitId}
                    </span>
                    <ConfidenceBadge confidence={b.confidence} />
                    {b.derivedFromDeity && (
                      <span className="ml-2 text-xs text-neutral-600">
                        {b.derivedFromDeity}をお祀りしているため
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {s.access && (
                <p className="mt-2 text-xs text-neutral-600">{s.access.reason}</p>
              )}
            </li>
          )
        })}
      </ul>

      {sites.length === 0 && (
        <p className="mt-6 rounded bg-neutral-100 p-4 text-sm text-neutral-700">
          条件に合う社寺が見つかりませんでした。
          {carFreeOnly && !includeUnknown && (
            <>
              {' '}
              バスの運行データが公開されていない地域があります。
              <Link href={`/benefits/${major}${qs({ unknown: '1' })}`} className="underline">
                判定不能も含めて表示
              </Link>
              すると増えることがあります。
            </>
          )}
        </p>
      )}

    </main>
  )
}
