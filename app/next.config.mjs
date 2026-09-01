import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 地理院タイル・OSM は <img> ではなく Leaflet が直接読むため image 最適化は不要
  images: { unoptimized: true },
  // ★ホームディレクトリなど上位に別の package-lock.json があると
  //   Next がそちらをワークスペースルートと誤認して警告を出す。
  //   このディレクトリを明示して固定する。
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
}

export default nextConfig
