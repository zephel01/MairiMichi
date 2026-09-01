/**
 * Google マップの URL スキーム。
 *
 * ★APIではなくリンクを組むだけ。APIキー不要・課金なし。
 *   経路の所要時間や可否は取れない（判定には使えない）。導線用途。
 *   Google Maps Platform Terms は結果のDB保存を禁じているが、
 *   URLスキームはその対象外。
 *
 * 'use client' を付けないこと。サーバコンポーネントからも呼ぶ。
 */

export type TravelMode = 'transit' | 'driving' | 'walking' | 'bicycling'

export function directionsUrl(
  lat: number,
  lng: number,
  mode: TravelMode = 'transit',
): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=${mode}`
}

export function mapUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}

/**
 * めぐりコース用の経由地つき経路（v2）。
 * ★waypoints はモバイルブラウザ最大3、その他最大9。URL長は2,048文字まで。
 */
export function courseUrl(
  points: Array<{ lat: number; lng: number }>,
  mode: TravelMode = 'transit',
  isMobile = false,
): string | null {
  if (points.length < 2) return null
  const maxWaypoints = isMobile ? 3 : 9
  const origin = points[0]!
  const destination = points[points.length - 1]!
  const waypoints = points.slice(1, -1)
  if (waypoints.length > maxWaypoints) return null

  const p = new URLSearchParams({
    api: '1',
    origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
    travelmode: mode,
  })
  if (waypoints.length > 0) {
    p.set('waypoints', waypoints.map((w) => `${w.lat},${w.lng}`).join('|'))
  }
  const url = `https://www.google.com/maps/dir/?${p.toString()}`
  return url.length <= 2048 ? url : null
}
