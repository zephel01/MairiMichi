/**
 * デモ用のサンプルデータ。
 *
 * ★これは UI を動かすための仮データであり、収録データではない。
 *   Phase 1b/1c の ETL が D1 を埋めたら差し替える。
 *   各フィールドが「どの状態を取りうるか」を UI で確認するための3件。
 *
 *   - 電車のみ / 御朱印あり / 作法は既定 / 式内社の典拠あり
 *   - 判定不能（GTFS未整備）/ 御朱印不明 / 導出なし（人物神）
 *   - 車必須 / 徒歩HARD / 浄土真宗で御朱印なし
 *
 * 座標・アクセス情報は実在の値ではなく、UI 検証用の仮値。
 */

import type { ClassicalSource, Site } from '@/core/types'
import { SHRINE_DEFAULT, TEMPLE_DEFAULT } from '@/core/etiquette'

export const SAMPLE_SOURCES: ClassicalSource[] = [
  {
    id: 'engishiki-yamashiro-otokuni-ikazuchi',
    work: 'engishiki',
    title: '延喜式',
    volume: '巻第九',
    section: '山城國乙訓郡',
    originalText: '乙訓坐大雷神社／名神大。月／次新甞。∥',
    provenance: 'zh.wikisource',
    rights: 'PD',
    sourceUrl: 'https://zh.wikisource.org/wiki/延喜式/卷第九',
  },
  {
    id: 'fudoki-izumo-kunibiki',
    work: 'fudoki',
    title: '出雲國風土記',
    section: '意宇郡',
    originalText: '所以號意宇者、國引坐八束水臣津野命詔',
    provenance: 'zh.wikisource',
    rights: 'PD',
    sourceUrl: 'https://zh.wikisource.org/wiki/古風土記/出雲國風土記',
  },
]

export const SAMPLE_SOURCE_MAP = new Map(SAMPLE_SOURCES.map((s) => [s.id, s]))

export const SAMPLE_SITES: Site[] = [
  {
    id: 'sample-otokuni',
    name: '乙訓坐大雷神社（サンプル）',
    type: 'shrine',
    prefectureCode: '26',
    lat: 34.9298,
    lng: 135.6917,
    address: '京都府（サンプル）',
    rank: ['式内社（名神大）'],
    deities: [
      {
        display: '大雷神',
        linkTarget: null,
        role: 'unknown',
        source: 'jawp',
        clusterId: null,
        matchedBy: null,
      },
      {
        display: '稲荷神',
        linkTarget: '稲荷神',
        role: 'unknown',
        source: 'jawp',
        clusterId: 'inari',
        matchedBy: 'linkTarget',
      },
    ],
    benefits: [
      {
        benefitId: 'shoubai_hanjou',
        majorId: 'shoubai',
        weight: 'primary',
        confidence: 'derived',
        derivedFromDeity: '稲荷神',
        derivedFromCluster: 'inari',
      },
      {
        benefitId: 'gokoku_houjou',
        majorId: 'nariwai',
        weight: 'primary',
        confidence: 'derived',
        derivedFromDeity: '稲荷神',
        derivedFromCluster: 'inari',
      },
      {
        benefitId: 'kinun',
        majorId: 'shoubai',
        weight: 'secondary',
        confidence: 'derived',
        derivedFromDeity: '稲荷神',
        derivedFromCluster: 'inari',
      },
    ],
    etiquette: SHRINE_DEFAULT,
    goshuin: {
      available: 'yes',
      hours: { from: '09:00', to: '16:00' },
      lunchBreak: { from: '12:00', to: '13:00' },
      writeStyle: 'both',
      fee: 300,
      unmanned: false,
      sourceUrl: 'https://example.jinja.jp/goshuin',
      verifiedAt: '2026-08-01',
    },
    access: {
      accessMode: 'TRAIN_ONLY',
      walkLoad: 'EASY',
      nearestStation: {
        name: '長岡京駅',
        lineName: 'JR東海道本線',
        distanceM: 960,
        walkMin: 12,
      },
      nearestBusStop: null,
      walkDistanceM: 960,
      walkMinutes: 12,
      ascentM: 18,
      descentM: 4,
      reliefAroundM: 12,
      reason: '長岡京駅から徒歩12分。',
      computedAt: '2026-09-01T00:00:00Z',
    },
    shikinai: {
      province: '山城國',
      district: '乙訓郡',
      shrineName: '乙訓坐大雷神社',
      rank: 'myojin_tai',
      offering: null,
      tsukinami: true,
      niiname: true,
      ainame: false,
      seats: 1,
      rawNote: '名神大。月／次新甞。',
      hasDefect: false,
    },
    citations: [
      {
        classicalSourceId: 'engishiki-yamashiro-otokuni-ikazuchi',
        layer: 1,
        benefitId: 'gokoku_houjou',
        connectionType: 'shikinai_rank',
        editorNote:
          '名神大社であり、月次祭・新嘗祭に預かる。国家的な祈年穀の対象だったことが、割注の記載だけから言えます。',
        ocrWarning: false,
      },
    ],
    lore: [],
    groups: [],
    dataQuality: {
      benefit: true,
      etiquette: false,
      goshuin: true,
      access: true,
      citation: true,
    },
  },

  {
    id: 'sample-kenkun',
    name: '某建勲系神社（サンプル）',
    type: 'shrine',
    prefectureCode: '32',
    lat: 35.4053,
    lng: 132.6857,
    address: '島根県（サンプル）',
    deities: [
      {
        display: '織田信長',
        linkTarget: '織田信長',
        role: 'unknown',
        source: 'jawp',
        clusterId: 'jinbutsu_shin',
        matchedBy: 'linkTarget',
      },
    ],
    // ★人物神なので御利益は導出されない。隠さず「不明」と出す
    benefits: [],
    etiquette: SHRINE_DEFAULT,
    goshuin: {
      available: 'unknown',
      writeStyle: 'unknown',
      unmanned: true,
    },
    access: {
      accessMode: 'UNKNOWN',
      walkLoad: 'MODERATE',
      nearestStation: null,
      nearestBusStop: {
        name: '大社前',
        operator: '一畑バス',
        distanceM: 640,
        walkMin: 8,
        tripsWeekday: null,
        tripsSat: null,
        tripsSun: null,
        unknownReason:
          'バス停「大社前」はありますが、この地域のバス運行データが公開されていないため便数を確認できません。現地の時刻表をご確認ください。',
      },
      walkDistanceM: 640,
      walkMinutes: 8,
      ascentM: 42,
      descentM: 6,
      reliefAroundM: 35,
      reason:
        'バス停「大社前」はありますが、この地域のバス運行データが公開されていないため便数を確認できません。現地の時刻表をご確認ください。',
      computedAt: '2026-09-01T00:00:00Z',
    },
    citations: [],
    lore: [],
    groups: [],
    dataQuality: {
      benefit: false,
      etiquette: false,
      goshuin: false,
      access: true,
      citation: false,
    },
  },

  {
    id: 'sample-yamadera',
    name: '某山中の寺（サンプル）',
    type: 'temple',
    denomination: '浄土真宗本願寺派',
    prefectureCode: '38',
    lat: 33.8416,
    lng: 132.7657,
    address: '愛媛県（サンプル）',
    deities: [
      {
        display: '阿弥陀如来',
        linkTarget: '阿弥陀如来',
        role: 'unknown',
        source: 'jawp',
        clusterId: 'amida',
        matchedBy: 'linkTarget',
      },
    ],
    // ★阿弥陀如来は現世利益に落ちないので導出しない
    benefits: [],
    etiquette: TEMPLE_DEFAULT,
    goshuin: {
      available: 'no',
      writeStyle: 'unknown',
      denominationNote:
        '浄土真宗では原則として御朱印を授与していません。一部の寺院で「法語印」を授与している場合があります。',
    },
    access: {
      accessMode: 'CAR_ONLY',
      walkLoad: 'HARD',
      nearestStation: null,
      nearestBusStop: {
        name: '谷口',
        operator: '伊予鉄バス',
        distanceM: 3400,
        walkMin: 42,
        tripsWeekday: 2,
        tripsSat: 0,
        tripsSun: 0,
      },
      walkDistanceM: 3400,
      walkMinutes: 42,
      ascentM: 210,
      descentM: 12,
      reliefAroundM: 180,
      reason: '最寄りの交通機関から徒歩42分。公共交通では現実的ではありません。',
      computedAt: '2026-09-01T00:00:00Z',
    },
    citations: [],
    lore: [],
    groups: [{ groupId: 'shikoku88', orderNo: 51 }],
    dataQuality: {
      benefit: false,
      etiquette: false,
      goshuin: true,
      access: true,
      citation: false,
    },
  },
]

export function findSample(id: string): Site | undefined {
  return SAMPLE_SITES.find((s) => s.id === id)
}
