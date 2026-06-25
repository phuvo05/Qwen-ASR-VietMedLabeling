'use client'
import { useState, useEffect, useCallback } from 'react'
import type { DatasetRecord, CheckedEntry } from '@/types'
import { parseDataset } from '@/lib/jsonlParser'
import { apiGet, apiGetText, apiPostJson } from '@/lib/apiClient'

const KEYS = {
  dataset: 'asr_dataset',
  checked: 'asr_checked',
  edited: 'asr_edited',
  currentId: 'asr_current_id',
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value))
}

export function useDataset() {
  const [records, setRecords] = useState<DatasetRecord[]>([])
  const [checked, setChecked] = useState<Record<string, CheckedEntry>>({})
  const [edited, setEdited] = useState<Record<string, string>>({})
  const [currentId, setCurrentIdState] = useState<string | null>(null)

  useEffect(() => {
    // Load dataset from server; fallback to localStorage
    apiGetText('/api/dataset')
      .then(content => setRecords(parseDataset(content)))
      .catch(() => {
        setRecords(load<DatasetRecord[]>(KEYS.dataset, []))
        setCurrentIdState(load<string | null>(KEYS.currentId, null))
      })
    // Load shared checked state from server; fallback to localStorage
    apiGet<Record<string, CheckedEntry>>('/api/checked')
      .then(data => setChecked(data))
      .catch(() => setChecked(load<Record<string, CheckedEntry>>(KEYS.checked, {})))
    // Load edited transcripts from server; fallback to localStorage
    apiGet<Record<string, string>>('/api/edited')
      .then(data => setEdited(data))
      .catch(() => setEdited(load<Record<string, string>>(KEYS.edited, {})))
  }, [])

  const loadDataset = useCallback((content: string) => {
    const parsed = parseDataset(content)
    setRecords(parsed)
    save(KEYS.dataset, parsed)
    setCurrentIdState(null)
    save(KEYS.currentId, null)
    // Save to server so other users auto-load this dataset
    apiPostJson('/api/dataset', { content }).catch(console.error)
  }, [])

  const setCurrentId = useCallback((id: string) => {
    setCurrentIdState(id)
    save(KEYS.currentId, id)
  }, [])

  const markChecked = useCallback((id: string, username?: string) => {
    const record = records.find((r) => r.id === id)
    const entry: CheckedEntry = {
      checked_at: new Date().toISOString(),
      original_transcript: record?.text ?? '',
      ...(username ? { checked_by: username } : {}),
    }
    setChecked((prev) => {
      const next = { ...prev, [id]: entry }
      save(KEYS.checked, next)
      return next
    })
    apiPostJson('/api/checked', { id, entry }).catch(console.error)
  }, [records])

  const uncheck = useCallback((id: string) => {
    setChecked((prev) => {
      const next = { ...prev }
      delete next[id]
      save(KEYS.checked, next)
      return next
    })
    apiPostJson('/api/checked', { id, entry: null }).catch(console.error)
  }, [])

  const setEditedTranscript = useCallback((id: string, text: string) => {
    setEdited((prev) => {
      const next = { ...prev, [id]: text }
      save(KEYS.edited, next)
      return next
    })
    apiPostJson('/api/edited', { id, text }).catch(console.error)
  }, [])

  const clearAll = useCallback(() => {
    setRecords([])
    setChecked({})
    setEdited({})
    setCurrentIdState(null)
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k))
  }, [])

  const importChecked = useCallback((entries: Array<{ id: string; checked_at: string; original_transcript: string; edited_transcript?: string }>) => {
    const newChecked: Record<string, CheckedEntry> = {}
    const newEdited: Record<string, string> = {}
    entries.forEach((e) => {
      newChecked[e.id] = { checked_at: e.checked_at, original_transcript: e.original_transcript }
      if (e.edited_transcript) newEdited[e.id] = e.edited_transcript
    })
    setChecked((prev) => {
      const merged = { ...prev, ...newChecked }
      save(KEYS.checked, merged)
      return merged
    })
    setEdited((prev) => {
      const merged = { ...prev, ...newEdited }
      save(KEYS.edited, merged)
      return merged
    })
  }, [])

  return {
    records,
    checked,
    edited,
    currentId,
    loadDataset,
    setCurrentId,
    markChecked,
    uncheck,
    setEditedTranscript,
    clearAll,
    importChecked,
  }
}
