'use client'
import { useRef } from 'react'
import type { DatasetRecord, CheckedEntry } from '@/types'

interface Props {
  records: DatasetRecord[]
  checked: Record<string, CheckedEntry>
  edited: Record<string, string>
  onImport: (entries: Array<{
    id: string
    checked_at: string
    original_transcript: string
    edited_transcript?: string
  }>) => void
}

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Levenshtein distance on token arrays
function levenshtein(a: string[], b: string[]): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[m][n]
}

function normalize(text: string) {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

function computeWer(ref: string, hyp: string): number {
  const r = normalize(ref).split(' ').filter(Boolean)
  const h = normalize(hyp).split(' ').filter(Boolean)
  if (r.length === 0) return h.length === 0 ? 0 : 1
  return Math.min(levenshtein(r, h) / r.length, 1)
}

function computeCer(ref: string, hyp: string): number {
  const r = normalize(ref).replace(/ /g, '').split('')
  const h = normalize(hyp).replace(/ /g, '').split('')
  if (r.length === 0) return h.length === 0 ? 0 : 1
  return Math.min(levenshtein(r, h) / r.length, 1)
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000
}

export default function ExportPanel({ records, checked, edited, onImport }: Props) {
  const importRef = useRef<HTMLInputElement>(null)
  const checkedCount = Object.keys(checked).length

  function exportCheckedIds() {
    const data = records
      .map((r, i) => {
        const entry = checked[r.id]
        if (!entry) return null
        const original = entry.original_transcript
        const editedTx = edited[r.id] ?? original
        const isCorrect = normalize(original) === normalize(editedTx)
        return {
          id: r.id,
          filename: r.id,
          index: i,
          checked_at: entry.checked_at,
          checked_by: entry.checked_by ?? null,
          original_transcript: original,
          edited_transcript: editedTx,
          is_correct: isCorrect,
          wer: round4(computeWer(editedTx, original)),
          cer: round4(computeCer(editedTx, original)),
        }
      })
      .filter(Boolean)
    downloadJson(data, 'checked_ids.json')
  }

  function exportFullReviewed() {
    const data = records.map((r) => {
      const entry = checked[r.id]
      const original = entry?.original_transcript ?? r.text
      const editedTx = edited[r.id] ?? r.text
      const isChecked = !!entry
      return {
        id: r.id,
        text: r.text,
        checked: isChecked,
        checked_at: entry?.checked_at ?? null,
        checked_by: entry?.checked_by ?? null,
        original_transcript: original,
        edited_transcript: editedTx,
        is_correct: isChecked ? normalize(original) === normalize(editedTx) : null,
        wer: isChecked ? round4(computeWer(editedTx, original)) : null,
        cer: isChecked ? round4(computeCer(editedTx, original)) : null,
        avg_confidence: r._avgConfidence,
      }
    })
    downloadJson(data, 'full_reviewed.json')
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const entries = JSON.parse(text)
      onImport(entries)
    } catch {
      alert('Lỗi đọc file checked_ids.json')
    }
    e.target.value = ''
  }

  return (
    <div className="bg-white border-t border-gray-200 p-3 flex gap-2 flex-wrap items-center">
      <span className="text-xs text-gray-500 mr-1">{checkedCount} checked</span>
      <button
        onClick={exportCheckedIds}
        disabled={checkedCount === 0}
        className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
      >
        Export checked_ids.json
      </button>
      <button
        onClick={exportFullReviewed}
        disabled={records.length === 0}
        className="px-3 py-1.5 text-xs bg-gray-700 text-white rounded hover:bg-gray-800 disabled:opacity-40"
      >
        Export full reviewed JSON
      </button>
      <button
        onClick={() => importRef.current?.click()}
        className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
      >
        Import checked_ids.json
      </button>
      <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
    </div>
  )
}
