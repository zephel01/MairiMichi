import { describe, it, expect } from 'vitest'
import { Readable } from 'node:stream'
import {
  extractPages,
  unescapeXml,
  stripWikisourceAnnotations,
  extractBodyText,
  allClassicalTitles,
  CLASSICAL_TITLES,
} from '@/etl/classical/wikisource-dump'
import {
  parsePageviewLine,
  scanPageviewDump,
  pageviewApiUrl,
  monthRange,
  fetchMonthlyViews,
  DumpFormatError,
} from '@/etl/priority/pageviews'

// ─────────────────────────────────────────────────────────
// Wikisource ダンプ
// ─────────────────────────────────────────────────────────

const DUMP_XML = `<mediawiki>
  <page>
    <title>雑多なページ</title>
    <revision><text xml:space="preserve">これは対象外</text></revision>
  </page>
  <page>
    <title>延喜式/卷第九</title>
    <revision>
      <text xml:space="preserve">神祇九
山城國百二十二座大五十三座小六十九座
乙訓郡十九座大五座小十四座
乙訓坐大雷神社／名神大。月／次新甞。∥
羽束師坐高御産日神社／大。月次新甞。∥</text>
    </revision>
  </page>
  <page>
    <title>古風土記/出雲國風土記</title>
    <revision><text xml:space="preserve">所以號意宇者、國引坐八束水臣津野命詔</text></revision>
  </page>
</mediawiki>`

describe('extractPages', () => {
  it('指定タイトルの本文だけを取り出す', async () => {
    const found = await extractPages(Readable.from([DUMP_XML]), [
      '延喜式/卷第九',
      '古風土記/出雲國風土記',
    ])
    expect(found.size).toBe(2)
    expect(found.get('延喜式/卷第九')?.text).toContain('乙訓坐大雷神社')
    expect(found.get('古風土記/出雲國風土記')?.text).toContain('國引坐八束水臣津野命')
  })

  it('対象外のページは拾わない', async () => {
    const found = await extractPages(Readable.from([DUMP_XML]), ['延喜式/卷第九'])
    expect(found.has('雑多なページ')).toBe(false)
  })

  it('存在しないタイトルは結果に入らない（黙って空文字にしない）', async () => {
    const found = await extractPages(Readable.from([DUMP_XML]), ['古事記 (原文)'])
    expect(found.size).toBe(0)
  })

  it('バイト数を返す', async () => {
    const found = await extractPages(Readable.from([DUMP_XML]), ['古風土記/出雲國風土記'])
    expect(found.get('古風土記/出雲國風土記')?.bytes).toBeGreaterThan(0)
  })
})

describe('unescapeXml', () => {
  it('エスケープを戻す（&amp; は最後）', () => {
    expect(unescapeXml('&lt;ref&gt;')).toBe('<ref>')
    expect(unescapeXml('&amp;lt;')).toBe('&lt;')
  })
})

describe('stripWikisourceAnnotations — 校勘注を落とせば PD 素材になる', () => {
  it('異体字併記マーカーは第1候補を残す', () => {
    expect(stripWikisourceAnnotations('{{另|効|敷/敦}}験')).toBe('効験')
  })

  it('校異注 <ref> を落とす', () => {
    expect(stripWikisourceAnnotations('本文<ref>校異</ref>続き')).toBe('本文続き')
  })

  it('コメントを落とす', () => {
    expect(stripWikisourceAnnotations('A<!--注-->B')).toBe('AB')
  })

  it('原文はそのまま残す', () => {
    const s = '乙訓坐大雷神社／名神大。月／次新甞。∥'
    expect(stripWikisourceAnnotations(s)).toBe(s)
  })
})

describe('extractBodyText', () => {
  it('カテゴリとナビゲーションテンプレートを落とす', () => {
    const s = `{{header|title=延喜式}}
本文の一行目
[[Category:延喜式]]
[[分类:日本]]`
    const r = extractBodyText(s)
    expect(r).toContain('本文の一行目')
    expect(r).not.toContain('Category')
    expect(r).not.toContain('分类')
    expect(r).not.toContain('header')
  })
})

describe('CLASSICAL_TITLES', () => {
  it('★ja.wikisource ではなく zh.wikisource のタイトル（漢字）', () => {
    expect(CLASSICAL_TITLES.engishiki).toContain('延喜式/卷第九')
    expect(CLASSICAL_TITLES.fudoki).toContain('古風土記/出雲國風土記')
    expect(CLASSICAL_TITLES.rikkokushi).toContain('日本三代實錄')
  })

  it('現存5風土記がすべて入っている', () => {
    expect(CLASSICAL_TITLES.fudoki).toHaveLength(5)
  })

  it('重複を除いた一覧を返す（日本書紀は記紀と六国史の両方にある）', () => {
    const all = allClassicalTitles()
    expect(new Set(all).size).toBe(all.length)
    expect(all).toContain('日本書紀')
  })
})

// ─────────────────────────────────────────────────────────
// pageview ダンプ
// ─────────────────────────────────────────────────────────

describe('parsePageviewLine', () => {
  it('ja.wikipedia / user の行を取る', () => {
    const r = parsePageviewLine('ja.wikipedia 明治神宮 12345 user 18438 A1B2C3')
    expect(r?.articleTitle).toBe('明治神宮')
    expect(r?.monthlyTotal).toBe(18438)
  })

  it('他プロジェクトの行は捨てる', () => {
    expect(parsePageviewLine('en.wikipedia Meiji_Shrine 999 user 100 X')).toBeNull()
  })

  it('★bot/spider は捨てる（agent_type=user のみ）', () => {
    expect(parsePageviewLine('ja.wikipedia 明治神宮 12345 spider 9999 X')).toBeNull()
    expect(parsePageviewLine('ja.wikipedia 明治神宮 12345 automated 9999 X')).toBeNull()
  })

  it('空行・コメントは null', () => {
    expect(parsePageviewLine('')).toBeNull()
    expect(parsePageviewLine('# comment')).toBeNull()
  })

  it('★列数が想定と違えば例外を投げる（黙って誤パースしない）', () => {
    expect(() => parsePageviewLine('ja.wikipedia 明治神宮')).toThrow(DumpFormatError)
  })

  it('例外に何を確認すべきか書いてある', () => {
    try {
      parsePageviewLine('a b')
      expect.unreachable()
    } catch (e) {
      expect((e as Error).message).toContain('形式が変わった可能性')
    }
  })
})

describe('scanPageviewDump', () => {
  async function* lines(arr: string[]) {
    for (const l of arr) yield l
  }

  it('対象記事だけ拾って月次にする', async () => {
    const r = await scanPageviewDump(
      lines([
        'ja.wikipedia 明治神宮 1 user 18438 X',
        'ja.wikipedia 清水寺 2 user 11148 X',
        'ja.wikipedia 無関係 3 user 999 X',
        'en.wikipedia 明治神宮 4 user 50 X',
      ]),
      new Set(['明治神宮', '清水寺']),
      2026,
      1,
    )
    expect(r.size).toBe(2)
    expect(r.get('明治神宮')).toEqual({ year: 2026, month: 1, views: 18438 })
  })

  it('アンダースコア区切りの記事名も引き当てる', async () => {
    const r = await scanPageviewDump(
      lines(['ja.wikipedia 出雲大社_(島根県) 1 user 100 X']),
      new Set(['出雲大社 (島根県)']),
      2026,
      1,
    )
    expect(r.get('出雲大社 (島根県)')?.views).toBe(100)
  })
})

describe('pageview REST API', () => {
  it('URLを組む（記事名はエンコードする）', () => {
    const url = pageviewApiUrl('明治神宮', '2026010100', '2026080100')
    expect(url).toContain('/ja.wikipedia/all-access/user/')
    expect(url).toContain(encodeURIComponent('明治神宮'))
    expect(url).toContain('/monthly/2026010100/2026080100')
  })

  it('スペースはアンダースコアにしてからエンコードする', () => {
    expect(pageviewApiUrl('出雲大社 (島根県)', 'a', 'b')).toContain(
      encodeURIComponent('出雲大社_(島根県)'),
    )
  })

  it('月範囲を作る', () => {
    expect(monthRange(2025, 12, 2026, 7)).toEqual({
      from: '2025120100',
      to: '2026070100',
    })
  })

  it('★User-Agent を必ず送る（無いとレート制限の対象になる）', async () => {
    let sentUA: string | undefined
    await fetchMonthlyViews('明治神宮', 'a', 'b', {
      userAgent: 'mairimichi/0.1 (contact@example.com)',
      sleepImpl: async () => {},
      fetchImpl: (async (_url: string, init?: RequestInit) => {
        sentUA = (init?.headers as Record<string, string>)['User-Agent']
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
      }) as unknown as typeof fetch,
    })
    expect(sentUA).toContain('mairimichi')
    expect(sentUA).toContain('contact@example.com')
  })

  it('★429 は指数バックオフでリトライする', async () => {
    let calls = 0
    const waits: number[] = []
    const rows = await fetchMonthlyViews('明治神宮', 'a', 'b', {
      userAgent: 'ua',
      sleepImpl: async (ms) => {
        waits.push(ms)
      },
      fetchImpl: (async () => {
        calls++
        if (calls < 3) return new Response('', { status: 429 })
        return new Response(
          JSON.stringify({ items: [{ timestamp: '2026010100', views: 18438 }] }),
          { status: 200 },
        )
      }) as unknown as typeof fetch,
    })
    expect(calls).toBe(3)
    expect(waits).toEqual([15_000, 45_000])
    expect(rows).toEqual([{ year: 2026, month: 1, views: 18438 }])
  })

  it('★404（記事なし）は空配列。views 0 とは区別する', async () => {
    const rows = await fetchMonthlyViews('存在しない記事', 'a', 'b', {
      userAgent: 'ua',
      sleepImpl: async () => {},
      fetchImpl: (async () => new Response('', { status: 404 })) as unknown as typeof fetch,
    })
    expect(rows).toEqual([])
  })

  it('リトライを使い切ったら例外', async () => {
    await expect(
      fetchMonthlyViews('x', 'a', 'b', {
        userAgent: 'ua',
        maxRetries: 1,
        sleepImpl: async () => {},
        fetchImpl: (async () => new Response('', { status: 429 })) as unknown as typeof fetch,
      }),
    ).rejects.toThrow('429')
  })

  it('timestamp を年月に分解する', async () => {
    const rows = await fetchMonthlyViews('x', 'a', 'b', {
      userAgent: 'ua',
      sleepImpl: async () => {},
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            items: [
              { timestamp: '2025120100', views: 9358 },
              { timestamp: '2026010100', views: 18438 },
            ],
          }),
          { status: 200 },
        )) as unknown as typeof fetch,
    })
    expect(rows).toEqual([
      { year: 2025, month: 12, views: 9358 },
      { year: 2026, month: 1, views: 18438 },
    ])
  })
})
