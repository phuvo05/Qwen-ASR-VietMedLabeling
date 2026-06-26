import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDataset } from '@/hooks/useDataset'

const SAMPLE = JSON.stringify([
  { id: 'new.wav', text: 'new transcript', timestamps: [] },
])

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    return handler(url, init)
  }))
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('useDataset loadDataset', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('does not replace local records when saving the new dataset to the server fails', async () => {
    mockFetch(async (url, init) => {
      if (init?.method === 'POST' && url.endsWith('/api/dataset')) {
        return jsonResponse({ detail: 'server down' }, 500)
      }
      return jsonResponse({}, 404)
    })

    const { result } = renderHook(() => useDataset())
    await waitFor(() => expect(result.current.records).toEqual([]))

    await expect(act(() => result.current.loadDataset(SAMPLE))).rejects.toThrow('server down')

    expect(result.current.records).toEqual([])
    expect(localStorage.getItem('asr_dataset')).toBeNull()
  })

  it('replaces records and clears stale checked/edited state only after server save succeeds', async () => {
    localStorage.setItem('asr_checked', JSON.stringify({ old: { checked_at: 'x', original_transcript: 'old' } }))
    localStorage.setItem('asr_edited', JSON.stringify({ old: 'edited old' }))

    mockFetch(async (url, init) => {
      if (init?.method === 'POST' && url.endsWith('/api/dataset')) {
        return jsonResponse({ status: 'ok' })
      }
      return jsonResponse({}, 404)
    })

    const { result } = renderHook(() => useDataset())
    await waitFor(() => expect(result.current.checked.old).toBeDefined())

    await act(async () => {
      await result.current.loadDataset(SAMPLE)
    })

    expect(result.current.records).toHaveLength(1)
    expect(result.current.records[0].id).toBe('new.wav')
    expect(result.current.checked).toEqual({})
    expect(result.current.edited).toEqual({})
    expect(localStorage.getItem('asr_checked')).toBe('{}')
    expect(localStorage.getItem('asr_edited')).toBe('{}')
  })
})
