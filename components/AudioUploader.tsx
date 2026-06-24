'use client'
import { useRef, useState } from 'react'
import type { AudioMetadata } from '@/types'
import { apiPost } from '@/lib/apiClient'

interface Props {
  onUploaded: (filenames: string[]) => void
}

export default function AudioUploader({ onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [lastUploaded, setLastUploaded] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      files.forEach((f) => formData.append('files', f))
      const results = await apiPost<AudioMetadata[]>('/api/upload-audio', formData)
      const names = results.map((r) => r.filename)
      setLastUploaded(names)
      onUploaded(names)
    } catch (err) {
      setError(String(err))
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div className="p-3 border border-dashed border-gray-300 rounded-lg bg-white">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Audio Files
      </p>
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="w-full py-2 px-3 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50 transition"
      >
        {uploading ? 'Đang upload...' : 'Upload Audio (.wav .mp3 .m4a .flac)'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".wav,.mp3,.m4a,.flac"
        multiple
        className="hidden"
        onChange={handleFiles}
      />
      {lastUploaded.length > 0 && (
        <p className="text-xs text-green-600 mt-1">
          ✓ Đã upload: {lastUploaded.join(', ')}
        </p>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}
