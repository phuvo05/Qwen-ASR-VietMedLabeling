'use client'
import { useRef } from 'react'

interface Props {
  onLoad: (content: string) => void
  recordCount: number
}

export default function JsonUploader({ onLoad, recordCount }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    try {
      onLoad(text)
    } catch (err) {
      alert(`Lỗi parse JSON: ${err}`)
    }
    e.target.value = ''
  }

  return (
    <div className="p-3 border border-dashed border-gray-300 rounded-lg bg-white">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Dataset JSON / JSONL
      </p>
      <button
        onClick={() => inputRef.current?.click()}
        className="w-full py-2 px-3 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition"
      >
        {recordCount > 0 ? `Đã load ${recordCount} records — Thay file` : 'Upload JSON / JSONL'}
      </button>
      <input ref={inputRef} type="file" accept=".json,.jsonl" className="hidden" onChange={handleFile} />
    </div>
  )
}
