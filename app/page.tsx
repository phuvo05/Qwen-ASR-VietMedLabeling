'use client'
import { useState, useCallback, useMemo } from 'react'
import { useDataset } from '@/hooks/useDataset'
import { useAudioMatch } from '@/hooks/useAudioMatch'
import { useKeyboard } from '@/hooks/useKeyboard'
import JsonUploader from '@/components/JsonUploader'
import ProgressBar from '@/components/ProgressBar'
import AudioUploader from '@/components/AudioUploader'
import ItemSidebar from '@/components/ItemSidebar'
import WaveformPlayer from '@/components/WaveformPlayer'
import TranscriptEditor from '@/components/TranscriptEditor'

export default function Home() {
  const ds = useDataset()
  const [retryTrigger, setRetryTrigger] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  const { audioUrl, loading: audioLoading, error: audioError } = useAudioMatch(
    ds.currentId,
    retryTrigger
  )

  const currentRecord = useMemo(
    () => ds.records.find((r) => r.id === ds.currentId) ?? null,
    [ds.records, ds.currentId]
  )

  const handleUploaded = useCallback(() => setRetryTrigger((t) => t + 1), [])

  useKeyboard({
    records: ds.records,
    currentId: ds.currentId,
    checked: ds.checked,
    onSelect: ds.setCurrentId,
    onCheck: ds.markChecked,
  })

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-80 flex-shrink-0 flex flex-col gap-2 p-3 border-r border-gray-200 bg-gray-50">
        <h1 className="text-base font-bold text-gray-800">ASR Labeling</h1>
        <JsonUploader onLoad={ds.loadDataset} recordCount={ds.records.length} />
        <ProgressBar total={ds.records.length} checked={Object.keys(ds.checked).length} />
        <AudioUploader onUploaded={handleUploaded} />
        <div className="flex-1 min-h-0 flex flex-col">
          <ItemSidebar
            records={ds.records}
            checked={ds.checked}
            currentId={ds.currentId}
            onSelect={ds.setCurrentId}
          />
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
        <WaveformPlayer
          audioUrl={audioUrl}
          loading={audioLoading}
          error={audioError}
          onTimeUpdate={setCurrentTime}
          onPlayPause={setIsPlaying}
        />
        <TranscriptEditor
          record={currentRecord}
          editedText={ds.currentId ? ds.edited[ds.currentId] : undefined}
          isChecked={!!ds.currentId && !!ds.checked[ds.currentId]}
          isPlaying={isPlaying}
          currentTime={currentTime}
          onSave={ds.setEditedTranscript}
          onCheck={ds.markChecked}
          onUncheck={ds.uncheck}
        />
      </main>
    </div>
  )
}
