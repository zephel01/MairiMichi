/**
 * data/*.yaml を型付きで読み込み、相互参照を検証する。
 *
 * ★なぜ検証が要るか
 *   cluster_benefits.yaml が benefits.yaml に無い御利益IDを指していても、
 *   deriveBenefits() は majorOf の解決に失敗して黙ってその1件を捨てる。
 *   つまり「稲荷神なのに商売繁盛が付かない」が、エラーも警告も無く起きる。
 *   YAMLのタイプミス1文字で導出が静かに壊れるので、ロード時に必ず検証する。
 */

import { parse as parseYaml } from 'yaml'
import type {
  BenefitMajor,
  BenefitMajorId,
  BenefitMinorId,
  ClusterBenefit,
  DeityCluster,
  PilgrimageGroup,
  Religion,
} from '@/core/types'
import type { BenefitTaxonomy } from '@/core/derive'
import type { DenominationRule, EtiquetteOverride } from '@/core/etiquette'

// ─────────────────────────────────────────────────────────
// YAML の生の形（data/*.yaml の構造）
// ─────────────────────────────────────────────────────────

interface RawBenefits {
  version: number
  majors: Array<{
    id: string
    label: string
    minors: Array<{ id: string; label: string }>
    typical_shinto?: string
    typical_buddhist?: string
    added_reason?: string
    note?: string
  }>
}

interface RawClusters {
  version: number
  clusters: Array<{
    id: string
    label: string
    religion: Religion
    qids?: string[]
    aliases?: string[]
    benefit_policy?: 'NO_AUTO_MAPPING' | 'NO_CURRENT_BENEFIT'
    note?: string
    sample_hits_400?: number
    wikidata_count?: number
  }>
}

interface RawClusterBenefits {
  version: number
  mappings: Array<{
    cluster: string
    primary?: string[]
    secondary?: string[]
    policy?: 'NO_AUTO_MAPPING' | 'NO_CURRENT_BENEFIT'
    note?: string
  }>
}

interface RawEtiquette {
  version: number
  defaults: Record<string, unknown>
  overrides: Array<{
    site_key: string
    name: string
    prefecture?: string
    bow_before: number
    clap: number
    bow_after: number
    label: string
    notes?: string
    source_url: string | null
    source_type: 'official' | 'default' | 'pending'
    status?: 'PENDING_VERIFICATION' | 'VERIFIED'
    verified_at?: string
  }>
  denomination_rules: Array<{
    denomination: string
    match: string[]
    goshuin_note: string
    goshuin_default: 'yes' | 'no' | 'unknown'
  }>
}

interface RawPilgrimages {
  version: number
  kinds: Array<{ id: string; label: string; desc?: string }>
  groups: Array<{
    id: string
    kind: string
    name: string
    total_count?: number
    region?: string
    numbered?: boolean
    disputed?: boolean
    source_url?: string
    note?: string
  }>
}

// ─────────────────────────────────────────────────────────
// 検証
// ─────────────────────────────────────────────────────────

export interface ValidationIssue {
  severity: 'error' | 'warning'
  file: string
  message: string
}

export class MasterDataError extends Error {
  constructor(public issues: ValidationIssue[]) {
    super(
      `マスタデータに ${issues.filter((i) => i.severity === 'error').length} 件の不整合があります:\n` +
        issues.map((i) => `  [${i.severity}] ${i.file}: ${i.message}`).join('\n'),
    )
    this.name = 'MasterDataError'
  }
}

export interface MasterData {
  majors: BenefitMajor[]
  taxonomy: BenefitTaxonomy
  clusters: DeityCluster[]
  clusterBenefits: Map<string, ClusterBenefit>
  etiquetteOverrides: Map<string, EtiquetteOverride>
  denominationRules: DenominationRule[]
  pilgrimages: PilgrimageGroup[]
  issues: ValidationIssue[]
}

const VALID_MAJOR_IDS: BenefitMajorId[] = [
  'enmusubi',
  'shoubai',
  'gakugyou',
  'kenkou',
  'yakuyoke',
  'anzan',
  'koutsuu',
  'shoubu',
  'kanai',
  'nariwai',
]

const VALID_PILGRIMAGE_KINDS = [
  'fudasho',
  'seven_gods',
  'three_shrines',
  'ichinomiya',
  'sandai',
  'local',
] as const

export interface RawSources {
  benefits: string
  deityClusters: string
  clusterBenefits: string
  etiquetteOverrides: string
  pilgrimageGroups: string
}

/**
 * YAML文字列群からマスタを組み立てて検証する。
 * error が1件でもあれば例外を投げる（黙って壊れたまま動かさない）。
 */
export function loadMasterData(src: RawSources): MasterData {
  const issues: ValidationIssue[] = []

  // ── benefits.yaml ────────────────────────────────
  const rawBenefits = parseYaml(src.benefits) as RawBenefits
  const majorOf = new Map<BenefitMinorId, BenefitMajorId>()
  const labelOf = new Map<BenefitMinorId, string>()
  const majors: BenefitMajor[] = []
  const seenMinor = new Set<string>()

  for (const m of rawBenefits.majors ?? []) {
    if (!VALID_MAJOR_IDS.includes(m.id as BenefitMajorId)) {
      issues.push({
        severity: 'error',
        file: 'benefits.yaml',
        message: `未知の大分類ID "${m.id}"。許可されるのは ${VALID_MAJOR_IDS.join(', ')}`,
      })
      continue
    }
    for (const mi of m.minors ?? []) {
      if (seenMinor.has(mi.id)) {
        issues.push({
          severity: 'error',
          file: 'benefits.yaml',
          message: `細分類ID "${mi.id}" が重複しています`,
        })
      }
      seenMinor.add(mi.id)
      majorOf.set(mi.id, m.id as BenefitMajorId)
      labelOf.set(mi.id, mi.label)
    }
    majors.push({
      id: m.id as BenefitMajorId,
      label: m.label,
      minors: (m.minors ?? []).map((x) => ({ id: x.id, label: x.label })),
      typicalShinto: m.typical_shinto,
      typicalBuddhist: m.typical_buddhist,
      addedReason: m.added_reason,
      note: m.note,
    })
  }

  const missingMajors = VALID_MAJOR_IDS.filter(
    (id) => !majors.some((m) => m.id === id),
  )
  if (missingMajors.length > 0) {
    issues.push({
      severity: 'error',
      file: 'benefits.yaml',
      message: `大分類が欠けています: ${missingMajors.join(', ')}`,
    })
  }

  // ── deity_clusters.yaml ──────────────────────────
  const rawClusters = parseYaml(src.deityClusters) as RawClusters
  const clusters: DeityCluster[] = []
  const clusterIds = new Set<string>()
  // ★別名の衝突は「どちらのクラスタに寄るか」が定義順依存になるので警告する
  const aliasOwner = new Map<string, string>()

  for (const c of rawClusters.clusters ?? []) {
    if (clusterIds.has(c.id)) {
      issues.push({
        severity: 'error',
        file: 'deity_clusters.yaml',
        message: `クラスタID "${c.id}" が重複しています`,
      })
    }
    clusterIds.add(c.id)

    const aliases = c.aliases ?? []
    for (const a of [c.label, ...aliases]) {
      const prev = aliasOwner.get(a)
      if (prev && prev !== c.id) {
        issues.push({
          severity: 'warning',
          file: 'deity_clusters.yaml',
          message: `別名 "${a}" が ${prev} と ${c.id} の両方にあります。先に定義された ${prev} が優先されます`,
        })
      } else {
        aliasOwner.set(a, c.id)
      }
    }

    clusters.push({
      id: c.id,
      label: c.label,
      religion: c.religion,
      qids: c.qids ?? [],
      aliases,
      benefitPolicy: c.benefit_policy,
      note: c.note,
    })
  }

  // ── cluster_benefits.yaml ────────────────────────
  const rawCB = parseYaml(src.clusterBenefits) as RawClusterBenefits
  const clusterBenefits = new Map<string, ClusterBenefit>()

  for (const m of rawCB.mappings ?? []) {
    // ★存在しないクラスタを指していないか
    if (!clusterIds.has(m.cluster)) {
      issues.push({
        severity: 'error',
        file: 'cluster_benefits.yaml',
        message: `クラスタ "${m.cluster}" が deity_clusters.yaml に存在しません`,
      })
    }
    if (clusterBenefits.has(m.cluster)) {
      issues.push({
        severity: 'error',
        file: 'cluster_benefits.yaml',
        message: `クラスタ "${m.cluster}" の割り当てが重複しています`,
      })
    }

    const primary = m.primary ?? []
    const secondary = m.secondary ?? []

    // ★存在しない御利益IDを指していないか。ここが最も静かに壊れる
    for (const [kind, list] of [
      ['primary', primary],
      ['secondary', secondary],
    ] as const) {
      for (const b of list) {
        if (!majorOf.has(b)) {
          issues.push({
            severity: 'error',
            file: 'cluster_benefits.yaml',
            message: `${m.cluster}.${kind} の御利益ID "${b}" が benefits.yaml に存在しません`,
          })
        }
      }
    }

    // primary と secondary の両方に同じIDがあるのは矛盾
    for (const b of primary) {
      if (secondary.includes(b)) {
        issues.push({
          severity: 'error',
          file: 'cluster_benefits.yaml',
          message: `${m.cluster}: "${b}" が primary と secondary の両方にあります`,
        })
      }
    }

    // ★primary が3つ以上あると「1寺社10タグ問題」が再発する
    if (!m.policy && primary.length > 2) {
      issues.push({
        severity: 'warning',
        file: 'cluster_benefits.yaml',
        message: `${m.cluster}: primary が ${primary.length} 件あります。設計方針は「1〜2個だけ」です`,
      })
    }
    if (!m.policy && primary.length === 0) {
      issues.push({
        severity: 'warning',
        file: 'cluster_benefits.yaml',
        message: `${m.cluster}: primary が空です。検索に一切出てきません`,
      })
    }

    clusterBenefits.set(m.cluster, {
      cluster: m.cluster,
      primary,
      secondary,
      policy: m.policy,
      note: m.note,
    })
  }

  // クラスタ側に割り当てが無いものを警告
  for (const c of clusters) {
    if (!clusterBenefits.has(c.id)) {
      issues.push({
        severity: 'warning',
        file: 'cluster_benefits.yaml',
        message: `クラスタ "${c.id}" に御利益の割り当てがありません。この祭神からは何も導出されません`,
      })
    }
  }

  // ── etiquette_overrides.yaml ─────────────────────
  const rawEt = parseYaml(src.etiquetteOverrides) as RawEtiquette
  const etiquetteOverrides = new Map<string, EtiquetteOverride>()

  for (const o of rawEt.overrides ?? []) {
    // ★出典が無いのに official を名乗るのは許さない
    if (o.source_type === 'official' && !o.source_url) {
      issues.push({
        severity: 'error',
        file: 'etiquette_overrides.yaml',
        message: `${o.name}: source_type が official なのに source_url がありません`,
      })
    }
    if (o.source_url && o.source_type === 'pending') {
      issues.push({
        severity: 'warning',
        file: 'etiquette_overrides.yaml',
        message: `${o.name}: source_url があるのに pending のままです。official に昇格させてください`,
      })
    }
    if (o.status === 'PENDING_VERIFICATION') {
      issues.push({
        severity: 'warning',
        file: 'etiquette_overrides.yaml',
        message: `${o.name}: 一次情報の裏取りが未了です（${o.label} は表示されません）`,
      })
    }
    etiquetteOverrides.set(o.site_key, {
      siteKey: o.site_key,
      name: o.name,
      bowBefore: o.bow_before,
      clap: o.clap,
      bowAfter: o.bow_after,
      label: o.label,
      notes: o.notes,
      sourceUrl: o.source_url,
      sourceType: o.source_type,
      status: o.status,
      verifiedAt: o.verified_at,
    })
  }

  const denominationRules: DenominationRule[] = (rawEt.denomination_rules ?? []).map(
    (r) => ({
      denomination: r.denomination,
      match: r.match,
      goshuinNote: r.goshuin_note,
      goshuinDefault: r.goshuin_default,
    }),
  )

  // ── pilgrimage_groups.yaml ───────────────────────
  const rawPg = parseYaml(src.pilgrimageGroups) as RawPilgrimages
  const pilgrimages: PilgrimageGroup[] = []
  const groupIds = new Set<string>()

  for (const g of rawPg.groups ?? []) {
    if (groupIds.has(g.id)) {
      issues.push({
        severity: 'error',
        file: 'pilgrimage_groups.yaml',
        message: `グループID "${g.id}" が重複しています`,
      })
    }
    groupIds.add(g.id)

    if (!(VALID_PILGRIMAGE_KINDS as readonly string[]).includes(g.kind)) {
      issues.push({
        severity: 'error',
        file: 'pilgrimage_groups.yaml',
        message: `${g.id}: 未知の kind "${g.kind}"`,
      })
    }
    // ★番号付きの巡礼は総数が無いと「N件中M件」の管理ができない
    if (g.numbered && !g.total_count) {
      issues.push({
        severity: 'warning',
        file: 'pilgrimage_groups.yaml',
        message: `${g.id}: numbered なのに total_count がありません。収録率を管理できません`,
      })
    }
    // ★「日本三大◯◯」は諸説あるものが多い
    if (g.kind === 'sandai' && !g.disputed) {
      issues.push({
        severity: 'warning',
        file: 'pilgrimage_groups.yaml',
        message: `${g.id}: kind が sandai です。諸説あるなら disputed: true を付けてください`,
      })
    }

    pilgrimages.push({
      id: g.id,
      kind: g.kind as PilgrimageGroup['kind'],
      name: g.name,
      totalCount: g.total_count,
      region: g.region,
      numbered: g.numbered,
      disputed: g.disputed,
      sourceUrl: g.source_url,
    })
  }

  const errors = issues.filter((i) => i.severity === 'error')
  if (errors.length > 0) throw new MasterDataError(issues)

  return {
    majors,
    taxonomy: { majorOf, labelOf },
    clusters,
    clusterBenefits,
    etiquetteOverrides,
    denominationRules,
    pilgrimages,
    issues,
  }
}

/** 検証結果を人が読める形にする（ETLの最後に出す） */
export function renderIssues(issues: ValidationIssue[]): string {
  if (issues.length === 0) return 'マスタデータの検証: 問題なし'
  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')
  const lines = [
    `マスタデータの検証: エラー ${errors.length} 件 / 警告 ${warnings.length} 件`,
    '',
  ]
  for (const i of [...errors, ...warnings]) {
    lines.push(`[${i.severity}] ${i.file}: ${i.message}`)
  }
  return lines.join('\n')
}
