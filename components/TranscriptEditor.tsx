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
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text)
  }
  execCopy(text)
  return Promise.resolve()
}

// LCS-based word diff: marks which words in `original` are changed vs `edited`
function diffOriginalWords(original: string, edited: string): Array<{ word: string; changed: boolean }> {
  const ow = original.trim().split(/\s+/).filter(Boolean)
  const ew = edited.trim().split(/\s+/).filter(Boolean)
  if (!ow.length) return []

  const m = ow.length, n = ew.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = ow[i - 1].toLowerCase() === ew[j - 1].toLowerCase()
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])

  const unchanged = new Set<number>()
  let i = m, j = n
  while (i > 0 && j > 0) {
    if (ow[i - 1].toLowerCase() === ew[j - 1].toLowerCase()) {
      unchanged.add(i - 1); i--; j--
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }

  return ow.map((word, idx) => ({ word, changed: !unchanged.has(idx) }))
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
  onNext: (() => void) | null
}

export default function TranscriptEditor({
  record,
  editedText,
  checkedEntry,
  currentTime,
  onSave,
  onCheck,
  onUncheck,
  onNext,
}: Props) {
  const isChecked = !!checkedEntry
  const [draft, setDraft] = useState(editedText ?? record?.text ?? '')
  const [copied, setCopied] = useState(false)
  const [copiedId, setCopiedId] = useState(false)
  const [saved, setSaved] = useState(false)

  const activeWordIdx = useWordHighlight(record?.timestamps ?? [], currentTime)

  useEffect(() => {
    setDraft(editedText ?? record?.text ?? '')
  }, [record?.id])

  const handleSave = useCallback(() => {
    if (!record) return
    onSave(record.id, draft)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }, [record, draft, onSave])

  const handleCopyTranscript = useCallback(() => {
    copyText(draft).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [draft])

  if (!record) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 rounded-lg text-gray-400 text-sm">
        Chọn một item để xem transcript
      </div>
    )
  }

  const diffWords = diffOriginalWords(record.text, draft)
  const changedCount = diffWords.filter((w) => w.changed).length

  return (
    <div className="flex-1 flex flex-col bg-white rounded-lg border border-gray-200 p-4 gap-2 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-1.5 text-sm text-gray-600 flex-wrap">
          <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{record.id}</span>
          <button
            onClick={() => copyText(record.id).then(() => { setCopiedId(true); setTimeout(() => setCopiedId(false), 1500) })}
            className={`text-xs px-1.5 py-0.5 rounded transition-all duration-150 ${
              copiedId ? 'bg-green-100 text-green-600 scale-110' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            }`}
            title="Copy ID"
          >
            {copiedId ? '✓' : '⎘'}
          </button>
          {record._avgConfidence !== null && (
            <span className="text-xs text-gray-400">
              Confidence: {Math.round(record._avgConfidence * 100)}%
            </span>
          )}
          {checkedEntry && (
            <span className="text-xs text-green-600 font-semibold">
              ✓ Đã check{checkedEntry.checked_by ? ` bởi ${checkedEntry.checked_by}` : ''}
            </span>
          )}
          {saved && (
            <span className="text-xs text-blue-600 font-semibold animate-pulse">✓ Đã lưu!</span>
          )}
        </div>
      </div>

      {/* Original transcript panel */}
      <div className="flex flex-col min-h-0 flex-1">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 flex-shrink-0">
          Original
        </p>
        <div className="overflow-y-auto text-sm leading-8 bg-gray-50 rounded p-2 flex-1">
          {record.timestamps.length > 0 ? (
            record.timestamps.map((t, i) => {
              const isActive = i === activeWordIdx
              const isChanged = diffWords[i]?.changed ?? false
              return (
                <span
                  key={i}
                  className={`rounded px-0.5 transition-colors duration-75 ${
                    isActive && isChanged ? 'bg-red-400 text-white' :
                    isActive             ? 'bg-yellow-300 text-gray-900' :
                    isChanged            ? 'bg-red-100 text-red-700' : ''
                  }`}
                >
                  {t.word}{' '}
                </span>
              )
            })
          ) : (
            diffWords.map((w, i) => (
              <span
                key={i}
                className={`rounded px-0.5 ${w.changed ? 'bg-red-100 text-red-700' : ''}`}
              >
                {w.word}{' '}
              </span>
            ))
          )}
        </div>
      </div>

      {/* Edited transcript panel */}
      <div className="flex flex-col min-h-0 flex-1">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 flex-shrink-0">
          Edited
          {changedCount > 0 && (
            <span className="ml-1.5 text-red-500 normal-case font-normal">
              {changedCount} từ thay đổi
            </span>
          )}
        </p>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="flex-1 resize-none text-sm leading-7 text-gray-800 border border-gray-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
          placeholder="Transcript..."
        />
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap items-center flex-shrink-0">
        {onNext && (
          <button
            onClick={onNext}
            className="px-3 py-1.5 text-sm bg-gray-800 text-white rounded hover:bg-gray-900"
          >
            Tiếp theo →
          </button>
        )}
        <button
          onClick={handleSave}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Lưu chỉnh sửa
        </button>
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
