/**
 * 穴の検出（設計書 §4.6）
 *
 * 「隙間を埋める判断」を主観ではなくクエリの結果で機械的に行う。
 * 穴の定義: 実際にユーザーが打ちうる組み合わせで、結果が0件または極端に少ないもの。
 *
 * ETL の最後に走らせ、0件になる組み合わせの一覧を出す。
 * ★その一覧が、そのまま次の収録キューになる。
 */

import type { BenefitMajorId, Site } from '@/core/types'
import { isReachableWithoutCar } from '@/core/access'

export type GapKind =
  | 'geography'
  | 'benefit'
  | 'access'
  | 'goshuin'
  | 'pilgrimage'
  | 'etiquette'

export interface Gap {
  kind: GapKind
  /** 人が読んで次に何をすべきか分かる文 */
  description: string
  /** 該当件数 */
  count: number
  /** 期待する最小件数 */
  expected: number
  region?: string
  benefitMajorId?: BenefitMajorId
  groupId?: string
}

export interface GapOptions {
  /** 都道府県あたりの最小件数 */
  minPerPrefecture: number
  /** 地方 × 大分類 の最小件数 */
  minPerRegionBenefit: number
  /** 地方あたりの「車なしで行ける」最小件数 */
  minCarFreePerRegion: number
  /** 地方あたりの「御朱印あり」最小件数 */
  minGoshuinPerRegion: number
}

export const DEFAULT_GAP_OPTIONS: GapOptions = {
  minPerPrefecture: 3,
  minPerRegionBenefit: 1,
  minCarFreePerRegion: 3,
  minGoshuinPerRegion: 3,
}

/** 8地方区分 */
export const REGIONS: Record<string, string[]> = {
  北海道: ['01'],
  東北: ['02', '03', '04', '05', '06', '07'],
  関東: ['08', '09', '10', '11', '12', '13', '14'],
  中部: ['15', '16', '17', '18', '19', '20', '21', '22', '23'],
  近畿: ['24', '25', '26', '27', '28', '29', '30'],
  中国: ['31', '32', '33', '34', '35'],
  四国: ['36', '37', '38', '39'],
  '九州・沖縄': ['40', '41', '42', '43', '44', '45', '46', '47'],
}

export function regionOf(prefectureCode: string): string | null {
  for (const [region, codes] of Object.entries(REGIONS)) {
    if (codes.includes(prefectureCode)) return region
  }
  return null
}

export interface PilgrimageCoverage {
  groupId: string
  name: string
  totalCount: number
  registered: number
}

export function detectGaps(
  sites: Site[],
  majorIds: BenefitMajorId[],
  pilgrimages: PilgrimageCoverage[] = [],
  options: GapOptions = DEFAULT_GAP_OPTIONS,
): Gap[] {
  const gaps: Gap[] = []

  // ── 地理の穴 ──────────────────────────────────────
  const byPref = new Map<string, number>()
  for (const s of sites) {
    byPref.set(s.prefectureCode, (byPref.get(s.prefectureCode) ?? 0) + 1)
  }
  for (const codes of Object.values(REGIONS)) {
    for (const code of codes) {
      const count = byPref.get(code) ?? 0
      if (count < options.minPerPrefecture) {
        gaps.push({
          kind: 'geography',
          description: `都道府県コード ${code} の収録が ${count} 件しかありません。`,
          count,
          expected: options.minPerPrefecture,
          region: code,
        })
      }
    }
  }

  // ── 地方 × 御利益 / アクセス / 御朱印 の穴 ────────
  const byRegion = new Map<string, Site[]>()
  for (const s of sites) {
    const r = regionOf(s.prefectureCode)
    if (!r) continue
    const arr = byRegion.get(r) ?? []
    arr.push(s)
    byRegion.set(r, arr)
  }

  for (const region of Object.keys(REGIONS)) {
    const list = byRegion.get(region) ?? []

    for (const majorId of majorIds) {
      const count = list.filter((s) =>
        s.benefits.some((b) => b.majorId === majorId && b.weight === 'primary'),
      ).length
      if (count < options.minPerRegionBenefit) {
        gaps.push({
          kind: 'benefit',
          description: `${region}に「${majorId}」の社寺が ${count} 件しかありません。`,
          count,
          expected: options.minPerRegionBenefit,
          region,
          benefitMajorId: majorId,
        })
      }
    }

    const carFree = list.filter(
      (s) => s.access && isReachableWithoutCar(s.access.accessMode),
    ).length
    if (carFree < options.minCarFreePerRegion) {
      gaps.push({
        kind: 'access',
        description: `${region}に「車なしで行ける」社寺が ${carFree} 件しかありません。`,
        count: carFree,
        expected: options.minCarFreePerRegion,
        region,
      })
    }

    const withGoshuin = list.filter((s) => s.goshuin?.available === 'yes').length
    if (withGoshuin < options.minGoshuinPerRegion) {
      gaps.push({
        kind: 'goshuin',
        description: `${region}に御朱印を授与している社寺が ${withGoshuin} 件しかありません。`,
        count: withGoshuin,
        expected: options.minGoshuinPerRegion,
        region,
      })
    }
  }

  // ── 巡礼の穴 ──────────────────────────────────────
  // ★構成社が欠けたグループは「めぐりコース」機能が成立しない
  for (const p of pilgrimages) {
    if (p.registered < p.totalCount) {
      gaps.push({
        kind: 'pilgrimage',
        description: `${p.name} が ${p.registered}/${p.totalCount} 件しか収録されていません。めぐりコース機能が成立しません。`,
        count: p.registered,
        expected: p.totalCount,
        groupId: p.groupId,
      })
    }
  }

  // ── 作法の穴 ──────────────────────────────────────
  const pending = sites.filter((s) => s.etiquette.sourceType === 'pending')
  if (pending.length > 0) {
    gaps.push({
      kind: 'etiquette',
      description: `参拝作法が未確認（PENDING_VERIFICATION）の社寺が ${pending.length} 件あります: ${pending
        .slice(0, 10)
        .map((s) => s.name)
        .join('、')}`,
      count: 0,
      expected: pending.length,
    })
  }

  return gaps
}

/** _OUTPUTS/gaps_YYYY-MM-DD.md にそのまま書ける Markdown を作る */
export function renderGapsMarkdown(gaps: Gap[], now = new Date()): string {
  const date = now.toISOString().slice(0, 10)
  const byKind = new Map<GapKind, Gap[]>()
  for (const g of gaps) {
    const arr = byKind.get(g.kind) ?? []
    arr.push(g)
    byKind.set(g.kind, arr)
  }

  const KIND_LABEL: Record<GapKind, string> = {
    geography: '地理の穴',
    benefit: '御利益の穴',
    access: 'アクセスの穴',
    goshuin: '御朱印の穴',
    pilgrimage: '巡礼の穴',
    etiquette: '作法の穴',
  }

  const lines: string[] = [
    `# MairiMichi 穴の検出結果 ${date}`,
    '',
    `検出した穴: **${gaps.length} 件**`,
    '',
    'この一覧が、そのまま次の収録キューになります。',
    '',
  ]

  for (const kind of Object.keys(KIND_LABEL) as GapKind[]) {
    const list = byKind.get(kind)
    if (!list || list.length === 0) continue
    lines.push(`## ${KIND_LABEL[kind]}（${list.length}件）`, '')
    for (const g of list) {
      lines.push(`- ${g.description}`)
    }
    lines.push('')
  }

  if (gaps.length === 0) lines.push('穴は検出されませんでした。')
  return lines.join('\n')
}
