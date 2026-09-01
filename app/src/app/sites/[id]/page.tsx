import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getMaster } from '@/data/master'
import { SAMPLE_SITES, SAMPLE_SOURCE_MAP, findSample } from '@/data/sample-sites'
import { AccessDetail } from '@/components/AccessBadge'
import { BenefitList } from '@/components/BenefitList'
import { CitationPanel, LorePanel } from '@/components/CitationPanel'
import { EtiquettePanel, GoshuinPanel } from '@/components/EtiquettePanel'
import { SiteMap, type MapMarker } from '@/components/SiteMap'
import { directionsUrl, mapUrl } from '@/lib/map-links'
import { describeShikinai } from '@/etl/classical/shikinai'
import type { DataQuality } from '@/core/types'

export function generateStaticParams() {
  return SAMPLE_SITES.map((s) => ({ id: s.id }))
}

/** ★人気ではなく「当サイトが何を確認済みか」を出す（§9.2-d） */
function DataQualityPanel({ dq }: { dq: DataQuality }) {
  const rows: Array<[string, boolean]> = [
    ['ご利益', dq.benefit],
    ['参拝作法', dq.etiquette],
    ['御朱印', dq.goshuin],
    ['アクセス', dq.access],
    ['典拠', dq.citation],
  ]
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {rows.map(([k, ok]) => (
        <li key={k} className={ok ? 'text-neutral-800' : 'text-neutral-400'}>
          <span aria-hidden>{ok ? '●' : '○'}</span> {k}
          <span className="sr-only">{ok ? '確認済み' : '未確認'}</span>
        </li>
      ))}
    </ul>
  )
}

export default async function SitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const site = findSample(id)
  if (!site) notFound()
  const master = getMaster()

  const markers: MapMarker[] = [
    { lat: site.lat, lng: site.lng, label: site.name, kind: 'site' },
  ]

  const groupNames = site.groups
    .map((g) => {
      const def = master.pilgrimages.find((p) => p.id === g.groupId)
      if (!def) return null
      const no = g.orderNo ? ` 第${g.orderNo}番` : ''
      const disputed = def.disputed ? '（諸説あり）' : ''
      return `${def.name}${no}${disputed}`
    })
    .filter((x): x is string => x !== null)

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/" className="text-sm underline">
        ← トップへ
      </Link>

      <header className="mt-3">
        <h1 className="text-2xl font-bold">{site.name}</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {site.type === 'shrine' ? '神社' : '寺院'}
          {site.denomination && ` / ${site.denomination}`}
          {site.address && ` / ${site.address}`}
        </p>
        {site.rank && site.rank.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2">
            {site.rank.map((r) => (
              <li key={r} className="rounded bg-stone-100 px-2 py-0.5 text-xs">
                {r}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <DataQualityPanel dq={site.dataQuality} />
        </div>
      </header>

      {/* ── ご利益 ─────────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">ご利益</h2>
        <div className="mt-3">
          <BenefitList
            benefits={site.benefits}
            taxonomy={master.taxonomy}
            showSecondary
          />
        </div>
        {site.deities.length > 0 && (
          <p className="mt-3 text-xs text-neutral-600">
            祭神・本尊: {site.deities.map((d) => d.display).join('、')}
            {site.deities.some((d) => d.clusterId === null) && (
              <span className="ml-1">
                （一部は一般的な言説と結び付けられていません）
              </span>
            )}
          </p>
        )}
      </section>

      {/* ── アクセス ───────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">行き方</h2>
        <div className="mt-3">
          <AccessDetail access={site.access} />
        </div>

        <div className="mt-3">
          <SiteMap center={{ lat: site.lat, lng: site.lng }} markers={markers} />
        </div>

        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          <a href={directionsUrl(site.lat, site.lng, 'transit')} className="underline" rel="noopener">
            電車・バスの経路
          </a>
          <a href={directionsUrl(site.lat, site.lng, 'driving')} className="underline" rel="noopener">
            車の経路
          </a>
          <a href={mapUrl(site.lat, site.lng)} className="underline" rel="noopener">
            地図で見る
          </a>
        </div>
      </section>

      {/* ── 参拝作法 ───────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">参拝作法</h2>
        <div className="mt-3">
          <EtiquettePanel etiquette={site.etiquette} type={site.type} />
        </div>
      </section>

      {/* ── 御朱印 ─────────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">御朱印</h2>
        <div className="mt-3">
          <GoshuinPanel goshuin={site.goshuin} />
        </div>
      </section>

      {/* ── 備考（巡礼グループ） ───────────────── */}
      {groupNames.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">所属する巡り</h2>
          <ul className="mt-2 list-inside list-disc text-sm">
            {groupNames.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      )}

      {/* ── 典拠 ───────────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">なぜこの社寺がそう信仰されてきたのか</h2>
        {site.shikinai && (
          <p className="mt-2 rounded bg-stone-50 p-3 text-sm">
            {describeShikinai({
              ...site.shikinai,
              offeringDetail: null,
              rawLine: site.shikinai.rawNote,
              defects: [],
            })}
          </p>
        )}
        <div className="mt-3">
          <CitationPanel citations={site.citations} sources={SAMPLE_SOURCE_MAP} />
        </div>
        <div className="mt-3">
          <LorePanel lore={site.lore} />
        </div>
      </section>

      {/* ── 評判は自前で持たず外部へ送客する（§9.2-b） ── */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">ほかの人の評価・参拝記録</h2>
        <p className="mt-1 text-sm text-neutral-700">
          当サイトは社寺に点数や順位を付けません。評価や写真は外部でご覧ください。
        </p>
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          <a href={mapUrl(site.lat, site.lng)} className="underline" rel="noopener">
            Google マップで見る
          </a>
          <a
            href={`https://hotokami.jp/search/?q=${encodeURIComponent(site.name)}`}
            className="underline"
            rel="noopener"
          >
            ホトカミで参拝記録を見る
          </a>
        </div>
      </section>

    </main>
  )
}
