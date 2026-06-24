'use client'
import { useEffect } from 'react'
import type { DatasetRecord, CheckedEntry } from '@/types'

interface Options {
  records: DatasetRecord[]
  currentId: string | null
  checked: Record<string, CheckedEntry>
  onSelect: (id: string) => void
  onCheck: (id: string) => void
}

export function useKeyboard({ records, currentId, onSelect, onCheck }: Options) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA'

      // Space: play/pause (never in input)
      if (e.code === 'Space' && !inInput) {
        e.preventDefault()
        const toggle = (window as unknown as Record<string, unknown>).__wavesurferTogglePlay
        if (typeof toggle === 'function') toggle()
        return
      }

      // Ctrl+C: copy current ID
      if (e.key === 'c' && (e.ctrlKey || e.metaKey) && !inInput) {
        if (currentId) {
          e.preventDefault()
          navigator.clipboard.writeText(currentId)
        }
        return
      }

      // Ctrl+S or Enter: mark checked
      if ((e.key === 'Enter' || (e.key === 's' && (e.ctrlKey || e.metaKey))) && !inInput) {
        e.preventDefault()
        if (currentId) onCheck(currentId)
        return
      }

      // Arrow navigation (not in input)
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !inInput) {
        e.preventDefault()
        if (!records.length) return
        const idx = records.findIndex((r) => r.id === currentId)
        if (e.key === 'ArrowUp' && idx > 0) onSelect(records[idx - 1].id)
        if (e.key === 'ArrowDown' && idx < records.length - 1) onSelect(records[idx + 1].id)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [records, currentId, onSelect, onCheck])
}
