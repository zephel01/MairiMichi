'use client'

import { useEffect, useRef } from 'react'

/**
 * 地図。地理院タイル（標準地図＋陰影起伏）を Leaflet で表示する。
 *
 * ★出典表示は必須。地理院タイル一覧ページへのリンクを消さないこと。
 *   標高タイル・陰影起伏図は基本測量成果ではないため、
 *   出典の明示のみで申請不要で使える。
 *
 * ★陰影起伏を重ねるのが「高低差が分かる」の視覚的な担保になる。
 *   HitoriYado の HotelMap.tsx と同じ構成。
 */

export interface MapMarker {
  lat: number
  lng: number
  label: string
  kind: 'site' | 'station' | 'busstop'
}

export function SiteMap({
  center,
  markers,
  zoom = 15,
  className = 'h-72 w-full rounded border',
}: {
  center: { lat: number; lng: number }
  markers: MapMarker[]
  zoom?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<unknown>(null)

  useEffect(() => {
    let cancelled = false
    const el = ref.current
    if (!el) return

    // Leaflet は SSR で window を触るので動的 import する
    void (async () => {
      const L = (await import('leaflet')).default
      if (cancelled || !ref.current) return

      // React の再マウントで二重初期化しないようにする
      if (mapRef.current) return

      const map = L.map(ref.current, {
        center: [center.lat, center.lng],
        zoom,
        scrollWheelZoom: false,
      })
      mapRef.current = map

      const attribution =
        '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>'

      L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
        attribution,
        maxZoom: 18,
      }).addTo(map)

      // 陰影起伏図を薄く重ねて地形の起伏を見せる
      L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/hillshademap/{z}/{x}/{y}.png', {
        attribution,
        maxZoom: 16,
        opacity: 0.3,
      }).addTo(map)

      for (const m of markers) {
        const icon = { site: '⛩', station: '🚃', busstop: '🚌' }[m.kind]
        L.marker([m.lat, m.lng], {
          icon: L.divIcon({
            className: 'mm-marker',
            html: `<span style="font-size:20px;line-height:1">${icon}</span>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          }),
        })
          .addTo(map)
          .bindTooltip(m.label)
      }
    })()

    return () => {
      cancelled = true
      const map = mapRef.current as { remove?: () => void } | null
      map?.remove?.()
      mapRef.current = null
    }
  }, [center.lat, center.lng, zoom, markers])

  return (
    <>
      {/* Leaflet の CSS。CDN ではなくパッケージから読む */}
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
        crossOrigin=""
      />
      <div ref={ref} className={className} />
    </>
  )
}
