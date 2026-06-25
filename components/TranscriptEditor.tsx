'use client'
import { useState, useEffect, useCallback } from 'react'
import type { DatasetRecord, CheckedEntry } from '@/types'
import { useWordHighlight } from '@/hooks/useWordHighlight'

function execCopy(text: string) {
  const el = document.createElement('textarea')
  el.value = text
  el.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
  document.body.appendChild(el)
  el.select()
  document.execCommand('copy')
  document.body.removeChild(el)
}

function copyText(text: string): Promise<void> {
  // navigator.clipboard exists on HTTP but throws NotAllowedError (needs HTTPS)
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text)
  }
  execCopy(text)
  return Promise.resolve()
}

interface Props {
  record: DatasetRecord | null
  editedText: string | undefined
  checkedEntry: CheckedEntry | null
  isPlaying: boolean
  currentTime: number
  onSave: (id: string, text: string) => void
  onCheck: (id: string) => void
  onUncheck: (id: string) => void
}

export default function TranscriptEditor({
  record,
  editedText,
  checkedEntry,
  isPlaying,
  currentTime,
  onSave,
  onCheck,
  onUncheck,
}: Props) {
  const isChecked = !!checkedEntry
  const displayText = editedText ?? record?.text ?? ''
  const [draft, setDraft] = useState(displayText)
  const [editMode, setEditMode] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copiedId, setCopiedId] = useState(false)
  const [saved, setSaved] = useState(false)

  const activeWordIdx = useWordHighlight(record?.timestamps ?? [], currentTime)

  useEffect(() => {
    setDraft(editedText ?? record?.text ?? '')
    setEditMode(false)
  }, [record?.id])

  useEffect(() => {
    if (isPlaying) setEditMode(false)
  }, [isPlaying])

  const handleSave = useCallback(() => {
    if (!record) return
    onSave(record.id, draft)
    setEditMode(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }, [record, draft, onSave])

  const handleCopyTranscript = useCallback(() => {
    copyText(displayText).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [displayText])

  if (!record) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 rounded-lg text-gray-400 text-sm">
        Chọn một item để xem transcript
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-white rounded-lg border border-gray-200 p-4 gap-3 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm text-gray-600">
          <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{record.id}</span>
          <button
            onClick={() => copyText(record.id).then(() => { setCopiedId(true); setTimeout(() => setCopiedId(false), 1500) })}
            className={`relative text-xs px-1.5 py-0.5 rounded transition-all duration-150 ${
              copiedId
                ? 'bg-green-100 text-green-600 scale-110'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            }`}
            title="Copy ID"
          >
            <span className={`inline-block transition-all duration-150 ${copiedId ? 'scale-110' : ''}`}>
              {copiedId ? '✓' : '⎘'}
            </span>
          </button>
          {record._avgConfidence !== null && (
            <span className="ml-2 text-xs text-gray-400">
              Confidence: {Math.round(record._avgConfidence * 100)}%
            </span>
          )}
          {checkedEntry && (
            <span className="ml-2 text-xs text-green-600 font-semibold">
              ✓ Đã check{checkedEntry.checked_by ? ` bởi ${checkedEntry.checked_by}` : ''}
            </span>
          )}
          {saved && <span className="ml-2 text-xs text-blue-600 font-semibold animate-pulse">✓ Đã lưu!</span>}
        </div>
        <button
          onClick={() => setEditMode((v) => !v)}
          className="text-xs text-blue-600 hover:underline"
        >
          {editMode ? 'Xem highlight' : 'Chỉnh sửa'}
        </button>
      </div>

      {/* Transcript area */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {!editMode ? (
          /* Play mode: word-level highlight */
          <div
            className="text-base leading-8 text-gray-800 cursor-text select-text"
            onClick={() => setEditMode(true)}
          >
            {record.timestamps.length > 0 ? (
              record.timestamps.map((t, i) => (
                <span
                  key={i}
                  className={`transition-colors duration-75 rounded px-0.5 ${
                    i === activeWordIdx
                      ? 'bg-yellow-300 text-gray-900'
                      : 'text-gray-800'
                  }`}
                >
                  {t.word}{' '}
                </span>
              ))
            ) : (
              <span>{displayText}</span>
            )}
          </div>
        ) : (
          /* Edit mode: textarea */
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full h-full min-h-[120px] resize-none text-base leading-7 text-gray-800 focus:outline-none"
            placeholder="Transcript..."
            autoFocus
          />
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        {editMode && (
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Lưu chỉnh sửa
          </button>
        )}
        {!isChecked ? (
          <button
            onClick={() => onCheck(record.id)}
            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
          >
            ✓ Mark Checked
          </button>
        ) : (
          <button
            onClick={() => onUncheck(record.id)}
            className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            Uncheck
          </button>
        )}
        <button
          onClick={handleCopyTranscript}
          className={`px-3 py-1.5 text-sm rounded transition-all duration-150 ${
            copied
              ? 'bg-green-100 text-green-700 scale-105'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {copied ? '✓ Đã copy!' : 'Copy transcript'}
        </button>
      </div>
    </div>
  )
}
