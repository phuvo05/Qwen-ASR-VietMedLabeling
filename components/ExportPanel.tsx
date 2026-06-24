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

export default function ExportPanel({ records, checked, edited, onImport }: Props) {
  const importRef = useRef<HTMLInputElement>(null)
  const checkedCount = Object.keys(checked).length

  function exportCheckedIds() {
    const data = records
      .map((r, i) => {
        const entry = checked[r.id]
        if (!entry) return null
        return {
          id: r.id,
          filename: r.id,
          index: i,
          checked_at: entry.checked_at,
          original_transcript: entry.original_transcript,
          edited_transcript: edited[r.id] ?? entry.original_transcript,
        }
      })
      .filter(Boolean)
    downloadJson(data, 'checked_ids.json')
  }

  function exportFullReviewed() {
    const data = records.map((r, i) => {
      const entry = checked[r.id]
      return {
        ...r,
        _avgConfidence: undefined,
        checked: !!entry,
        edited_transcript: edited[r.id] ?? r.text,
        checked_at: entry?.checked_at ?? null,
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
