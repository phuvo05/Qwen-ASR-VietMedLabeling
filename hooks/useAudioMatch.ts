'use client'
import { useState, useEffect } from 'react'
import { apiGet } from '@/lib/apiClient'

interface PresignedUrlResponse {
  url: string
  filename: string
  expires_in: number
}

export function useAudioMatch(currentId: string | null, retryTrigger: number) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!currentId) {
      setAudioUrl(null)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    apiGet<PresignedUrlResponse>(`/api/presigned-url/${encodeURIComponent(currentId)}`)
      .then((data) => {
        setAudioUrl(data.url)
      })
      .catch(() => {
        setAudioUrl(null)
        setError(`Audio chưa được upload — upload file có tên "${currentId}" để tiếp tục`)
      })
      .finally(() => setLoading(false))
  }, [currentId, retryTrigger])

  return { audioUrl, loading, error }
}
