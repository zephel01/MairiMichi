import { describe, it, expect } from 'vitest'
import {
  decodeDemPixel,
  demLayersForZoom,
  demTileUrl,
  lngLatToTile,
  tileToLngLat,
  cumulativeElevation,
  computeRelief,
  ringPoints,
} from '@/core/elevation'

describe('decodeDemPixel', () => {
  it('★調査で標高APIと一致を確認した値を再現する', () => {
    // タイル z15/28896/12902 の画素(128,128) → 1187.16 m
    // getelevation.php の返り値 1187.2 と一致することを確認済み
    // x = 118716 = 1*65536 + 207*256 + 188
    expect(decodeDemPixel(1, 207, 188)).toBe(1187.16)
  })

  it('海抜0m', () => {
    expect(decodeDemPixel(0, 0, 0)).toBe(0)
  })

  it('負の標高（2^23 以上は負数として解釈する）', () => {
    // x = 2^24 - 100 → -1.00 m
    const x = 2 ** 24 - 100
    const r = Math.floor(x / 65536)
    const g = Math.floor((x % 65536) / 256)
    const b = x % 256
    expect(decodeDemPixel(r, g, b)).toBe(-1)
  })

  it('★無効値 (128,0,0) は null（0m と取り違えない）', () => {
    expect(decodeDemPixel(128, 0, 0)).toBeNull()
  })
})

describe('DEM レイヤのフォールバック', () => {
  it('★5A → 5B → 5C → 10B の順で試す', () => {
    expect(demLayersForZoom(15)).toEqual(['dem5a_png', 'dem5b_png', 'dem5c_png'])
  })

  it('z14 では DEM10B も使える', () => {
    expect(demLayersForZoom(14)).toEqual([
      'dem5a_png',
      'dem5b_png',
      'dem5c_png',
      'dem_png',
    ])
  })

  it('★dem_png は z15 で 404 になるので候補に出さない', () => {
    expect(demLayersForZoom(15)).not.toContain('dem_png')
  })

  it('タイルURLを組む', () => {
    expect(demTileUrl('dem5a_png', 15, 28896, 12902)).toBe(
      'https://cyberjapandata.gsi.go.jp/xyz/dem5a_png/15/28896/12902.png',
    )
  })
})

describe('タイル座標', () => {
  it('緯度経度 → タイル座標', () => {
    const t = lngLatToTile(137.466431, 35.688533, 15)
    expect(t.x).toBe(28896)
    expect(t.y).toBe(12902)
  })

  it('往復してほぼ元に戻る', () => {
    const lng = 135.7727
    const lat = 34.9671
    const t = lngLatToTile(lng, lat, 15)
    const back = tileToLngLat(t)
    expect(Math.abs(back.lng - lng)).toBeLessThan(0.01)
    expect(Math.abs(back.lat - lat)).toBeLessThan(0.01)
  })
})

describe('cumulativeElevation', () => {
  it('累積登り・下りを分けて集計する', () => {
    const pts = [10, 20, 15, 40].map((e, i) => ({ lat: i, lng: i, elevation: e }))
    const r = cumulativeElevation(pts)
    expect(r.ascentM).toBe(35) // +10, +25
    expect(r.descentM).toBe(5)
    expect(r.coverage).toBe(1)
  })

  it('★未整備（null）の区間は線形補間せず、つながずスキップする', () => {
    const pts = [
      { lat: 0, lng: 0, elevation: 10 },
      { lat: 1, lng: 1, elevation: null },
      { lat: 2, lng: 2, elevation: 100 },
    ]
    const r = cumulativeElevation(pts)
    // 10 → 100 を +90 とは数えない（間が切れているため）
    expect(r.ascentM).toBe(0)
    expect(r.coverage).toBeCloseTo(2 / 3)
  })

  it('空なら 0', () => {
    expect(cumulativeElevation([])).toEqual({ ascentM: 0, descentM: 0, coverage: 0 })
  })
})

describe('computeRelief — 境内周辺の起伏', () => {
  it('地点標高 − リング最低標高', () => {
    const r = computeRelief(100, [70, 75, 80, 90, 85, 78, 72, 88])
    expect(r.relief).toBe(30)
    expect(r.range).toBe(20)
    expect(r.terrain).toBe('rolling')
  })

  it('平坦地', () => {
    expect(computeRelief(10, [8, 9, 10, 11, 12, 9, 8, 10]).terrain).toBe('flat')
  })

  it('起伏が大きい', () => {
    expect(computeRelief(300, [200, 250, 180, 320, 210, 190, 240, 260]).terrain).toBe(
      'hilly',
    )
  })

  it('標高が取れなければ null（推測しない）', () => {
    expect(computeRelief(null, [1, 2]).relief).toBeNull()
    expect(computeRelief(100, [null, null]).relief).toBeNull()
  })
})

describe('ringPoints', () => {
  it('8方位の点を返す', () => {
    const pts = ringPoints(35.0, 135.0, 400)
    expect(pts).toHaveLength(8)
    for (const p of pts) {
      expect(Math.abs(p.lat - 35.0)).toBeLessThan(0.01)
      expect(Math.abs(p.lng - 135.0)).toBeLessThan(0.01)
    }
  })
})
