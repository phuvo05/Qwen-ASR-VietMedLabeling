'use client'
import { useRef, useState, useCallback } from 'react'
import type { AudioMetadata } from '@/types'
import { apiPost } from '@/lib/apiClient'

interface Props {
  onUploaded: (filenames: string[]) => void
}

const ACCEPT = ['.wav', '.mp3', '.m4a', '.flac']

export default function AudioUploader({ onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [lastUploaded, setLastUploaded] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  async function uploadFiles(files: File[]) {
    const audio = files.filter(f => ACCEPT.some(ext => f.name.toLowerCase().endsWith(ext)))
    if (!audio.length) return
    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      audio.forEach((f) => formData.append('files', f))
      const results = await apiPost<AudioMetadata[]>('/api/upload-audio', formData)
      const names = results.map((r) => r.filename)
      setLastUploaded(names)
      onUploaded(names)
    } catch (err) {
      setError(String(err))
    } finally {
      setUploading(false)
    }
  }

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    await uploadFiles(files)
    e.target.value = ''
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    await uploadFiles(files)
  }, [])

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`p-3 border-2 border-dashed rounded-lg transition-colors ${
        dragging
          ? 'border-green-400 bg-green-50'
          : 'border-gray-300 bg-white'
      }`}
    >
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
      <p className="text-xs text-gray-400 text-center mt-1">hoặc kéo thả file vào đây</p>
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
