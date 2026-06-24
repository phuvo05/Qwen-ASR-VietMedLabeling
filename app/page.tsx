'use client'
import { useDataset } from '@/hooks/useDataset'
import JsonUploader from '@/components/JsonUploader'
import ProgressBar from '@/components/ProgressBar'

export default function Home() {
  const ds = useDataset()

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left panel */}
      <aside className="w-80 flex-shrink-0 flex flex-col gap-2 p-3 border-r border-gray-200 bg-gray-50 overflow-y-auto">
        <h1 className="text-base font-bold text-gray-800">ASR Labeling</h1>
        <JsonUploader onLoad={ds.loadDataset} recordCount={ds.records.length} />
        <ProgressBar total={ds.records.length} checked={Object.keys(ds.checked).length} />
        {/* AudioUploader, ItemSidebar — added in later tasks */}
        <div className="flex-1" />
      </aside>

      {/* Right panel */}
      <main className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
        {ds.records.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <p>Upload file JSON để bắt đầu</p>
          </div>
        ) : (
          <div className="text-gray-500 text-sm">
            {ds.currentId
              ? `Đang xem: ${ds.currentId}`
              : 'Chọn một item từ sidebar'}
          </div>
        )}
        {/* WaveformPlayer, TranscriptEditor — added in later tasks */}
      </main>
    </div>
  )
}
