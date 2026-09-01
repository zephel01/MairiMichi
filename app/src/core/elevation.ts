/**
 * 標高（国土地理院 DEM タイル）
 *
 * ★標高API（getelevation.php）は使わない。
 *   1点1リクエストで、試験公開かつ「過度の負担を与えると予告なく遮断」と明記。
 *   DEM タイルなら 1リクエスト = 65,536点。桁違いに効率的。
 *
 * 検証済み（設計書 §6.4）:
 *   タイル z15/28896/12902 の画素(128,128) → 緯度経度 35.688533, 137.466431
 *     PNGデコード      → 1187.16 m
 *     getelevation.php → 1187.2 m   ← 一致
 *
 * ★テキスト形式の標高タイル（/xyz/dem5a/{z}/{x}/{y}.txt）は
 *   令和6年10月で更新停止。新規実装では PNG を使う。
 *
 * 出典表示（必須）:
 *   出典：国土地理院ウェブサイト（地理院タイル（標高タイル））を加工して作成
 *   https://maps.gsi.go.jp/development/ichiran.html
 *   ※標高タイルは基本測量成果ではないため、一括取得・ローカル保存も出典表示のみで可。
 */

/** 無効値を示す画素 */
export const DEM_INVALID_RGB = [128, 0, 0] as const

/**
 * DEM PNG の1画素を標高[m]に変換する。
 * 無効値は null。
 */
export function decodeDemPixel(r: number, g: number, b: number): number | null {
  if (r === DEM_INVALID_RGB[0] && g === DEM_INVALID_RGB[1] && b === DEM_INVALID_RGB[2]) {
    return null
  }
  const x = r * 65536 + g * 256 + b
  const h = x < 2 ** 23 ? x * 0.01 : (x - 2 ** 24) * 0.01
  return Math.round(h * 100) / 100
}

/**
 * DEM タイルの種類。
 * ★5A/5B/5C は地域により未整備（404）があるので、この順でフォールバックする。
 */
export const DEM_LAYERS = [
  { id: 'dem5a_png', maxZoom: 15, label: 'DEM5A' },
  { id: 'dem5b_png', maxZoom: 15, label: 'DEM5B' },
  { id: 'dem5c_png', maxZoom: 15, label: 'DEM5C' },
  { id: 'dem_png', maxZoom: 14, label: 'DEM10B' },
] as const

export type DemLayerId = (typeof DEM_LAYERS)[number]['id']

export function demTileUrl(layer: DemLayerId, z: number, x: number, y: number): string {
  return `https://cyberjapandata.gsi.go.jp/xyz/${layer}/${z}/${x}/${y}.png`
}

/** 指定ズームで使えるレイヤをフォールバック順に返す */
export function demLayersForZoom(z: number): DemLayerId[] {
  return DEM_LAYERS.filter((l) => z <= l.maxZoom).map((l) => l.id)
}

// ─────────────────────────────────────────────────────────
// タイル座標
// ─────────────────────────────────────────────────────────

export interface TileCoord {
  z: number
  x: number
  y: number
  /** タイル内の画素座標（0..255） */
  px: number
  py: number
}

const TILE_SIZE = 256

/** 緯度経度 → タイル座標＋タイル内画素（Web メルカトル） */
export function lngLatToTile(lng: number, lat: number, z: number): TileCoord {
  const n = 2 ** z
  const fx = ((lng + 180) / 360) * n
  const latRad = (lat * Math.PI) / 180
  const fy =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  const x = Math.floor(fx)
  const y = Math.floor(fy)
  return {
    z,
    x,
    y,
    px: Math.min(TILE_SIZE - 1, Math.floor((fx - x) * TILE_SIZE)),
    py: Math.min(TILE_SIZE - 1, Math.floor((fy - y) * TILE_SIZE)),
  }
}

/** タイル座標＋画素 → 緯度経度（画素中心） */
export function tileToLngLat(t: TileCoord): { lng: number; lat: number } {
  const n = 2 ** t.z
  const fx = t.x + (t.px + 0.5) / TILE_SIZE
  const fy = t.y + (t.py + 0.5) / TILE_SIZE
  const lng = (fx / n) * 360 - 180
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * fy) / n)))
  return { lng, lat: (latRad * 180) / Math.PI }
}

// ─────────────────────────────────────────────────────────
// 導出値
// ─────────────────────────────────────────────────────────

export interface ElevationPoint {
  lat: number
  lng: number
  elevation: number | null
}

/**
 * 経路上の累積登り・累積下りを求める。
 * null（未整備）は前後を線形につながず、その区間をスキップする。
 * 推測で補間しない。
 */
export function cumulativeElevation(points: ElevationPoint[]): {
  ascentM: number
  descentM: number
  /** 有効な標高が取れた区間の割合。低いときはUIで注記する */
  coverage: number
} {
  let ascent = 0
  let descent = 0
  let valid = 0
  let prev: number | null = null

  for (const p of points) {
    if (p.elevation === null) {
      prev = null
      continue
    }
    valid++
    if (prev !== null) {
      const d = p.elevation - prev
      if (d > 0) ascent += d
      else descent += -d
    }
    prev = p.elevation
  }

  return {
    ascentM: Math.round(ascent * 10) / 10,
    descentM: Math.round(descent * 10) / 10,
    coverage: points.length === 0 ? 0 : valid / points.length,
  }
}

/**
 * 境内周辺の起伏。HitoriYado の relief と同じ導出。
 * 地点の標高 − 半径 R の8方位リングの最低標高。
 */
export function computeRelief(
  center: number | null,
  ring: Array<number | null>,
): { relief: number | null; range: number | null; terrain: 'flat' | 'rolling' | 'hilly' | null } {
  const valid = ring.filter((v): v is number => v !== null)
  if (center === null || valid.length === 0) {
    return { relief: null, range: null, terrain: null }
  }
  const min = Math.min(...valid)
  const max = Math.max(...valid)
  const relief = Math.round((center - min) * 10) / 10
  const range = Math.round((max - min) * 10) / 10
  const terrain = range < 20 ? 'flat' : range < 60 ? 'rolling' : 'hilly'
  return { relief, range, terrain }
}

/** 半径 R[m] の8方位リングの緯度経度を返す */
export function ringPoints(
  lat: number,
  lng: number,
  radiusM = 400,
): Array<{ lat: number; lng: number }> {
  const out: Array<{ lat: number; lng: number }> = []
  const dLat = radiusM / 111_320
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180))
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4
    out.push({ lat: lat + dLat * Math.cos(a), lng: lng + dLng * Math.sin(a) })
  }
  return out
}
