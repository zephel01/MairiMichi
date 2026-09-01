import { BENEFIT_DISCLAIMER } from './BenefitList'

/** 帰属表示。★消さないこと（各データ源の利用条件） */
export function Attribution() {
  return (
    <footer className="mt-16 border-t px-4 py-6 text-xs leading-relaxed text-neutral-600">
      <p>
        出典：「国土数値情報（鉄道データ・バス停留所データ・高速バス停留所データ・行政区域データ）」（国土交通省）
        <a href="https://nlftp.mlit.go.jp/ksj/" className="underline">
          https://nlftp.mlit.go.jp/ksj/
        </a>
        を加工して作成
      </p>
      <p>
        出典：国土地理院ウェブサイト（地理院タイル・標高タイル）を加工して作成{' '}
        <a href="https://maps.gsi.go.jp/development/ichiran.html" className="underline">
          地理院タイル一覧
        </a>
      </p>
      <p>
        地図データ・経路計算：©{' '}
        <a href="https://www.openstreetmap.org/copyright" className="underline">
          OpenStreetMap contributors
        </a>{' '}
        （ODbL 1.0） / Valhalla（MIT）
      </p>
      <p>バス時刻表：各事業者提供のGTFS-JPデータ（ライセンスはフィード別）</p>
      <p>文化財情報：各自治体オープンデータ「文化財一覧」（CC BY 4.0）</p>
      <p>祭神・本尊等：Wikidata（CC0） / Wikipedia（CC BY-SA 4.0）</p>
      <p>古典本文：Wikisource（原文はパブリックドメイン／校勘注は CC BY-SA 4.0）</p>
      <p>
        古事記の書き下し・現代語訳：武田祐吉『校註古事記』『現代語譯古事記』（青空文庫・パブリックドメイン）
      </p>
      <p>
        式内社の比定・神階：國學院大學デジタルミュージアム（延喜式内社データベース／神道・神社史料集成）
      </p>
      <p>
        近代の地域資料：国立国会図書館デジタルコレクション（次世代デジタルライブラリー）
        ※OCRテキストのため誤りを含む場合があります
      </p>
      <p className="mt-3">
        {BENEFIT_DISCLAIMER}
      </p>
      <p>作法は社寺により異なる場合があります。現地の案内表示に従ってください。</p>
    </footer>
  )
}
