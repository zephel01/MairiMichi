import Link from 'next/link'
import { getMaster } from '@/data/master'
import { SAMPLE_SITES } from '@/data/sample-sites'

export default function Home() {
  const master = getMaster()

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">MairiMichi — まいり道</h1>
      <p className="mt-2 text-neutral-700">
        願いから社寺を探せます。なぜそのご利益で信仰されてきたのかを、
        祭神・本尊と一次史料まで出典つきで示します。
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">願いから探す</h2>
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {master.majors.map((m) => (
            <li key={m.id}>
              <Link
                href={`/benefits/${m.id}`}
                className="block rounded border px-3 py-3 text-sm hover:bg-neutral-50"
              >
                <span className="font-medium">{m.label}</span>
                <span className="mt-0.5 block text-xs text-neutral-500">
                  {m.minors.map((x) => x.label).join('・')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">サンプル（UI 確認用）</h2>
        <p className="mt-1 text-xs text-neutral-600">
          ★収録データではありません。ETL が D1 を埋めるまでの仮データです。
        </p>
        <ul className="mt-3 space-y-1 text-sm">
          {SAMPLE_SITES.map((s) => (
            <li key={s.id}>
              <Link href={`/sites/${s.id}`} className="underline">
                {s.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
