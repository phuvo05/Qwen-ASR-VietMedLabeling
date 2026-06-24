'use client'
import { useState, useRef, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { DatasetRecord, CheckedEntry, FilterMode } from '@/types'

interface Props {
  records: DatasetRecord[]
  checked: Record<string, CheckedEntry>
  currentId: string | null
  onSelect: (id: string) => void
}

export default function ItemSidebar({ records, checked, currentId, onSelect }: Props) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterMode>('all')
  const parentRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    return records.filter((r, i) => {
      if (filter === 'checked' && !checked[r.id]) return false
      if (filter === 'unchecked' && checked[r.id]) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          r.id.toLowerCase().includes(q) ||
          r.text.toLowerCase().includes(q) ||
          String(i + 1).includes(q)
        )
      }
      return true
    })
  }, [records, checked, filter, search])

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 10,
  })

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Search */}
      <input
        type="text"
        placeholder="Tìm theo ID, transcript..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded mb-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
      />

      {/* Filter tabs */}
      <div className="flex gap-1 mb-2">
        {(['all', 'unchecked', 'checked'] as FilterMode[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 text-xs py-1 rounded capitalize ${
              filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {f === 'all' ? 'Tất cả' : f === 'checked' ? 'Đã check' : 'Chưa check'}
          </button>
        ))}
      </div>

      <div className="text-xs text-gray-400 mb-1">{filtered.length} items</div>

      {/* Virtual list */}
      <div ref={parentRef} className="flex-1 overflow-y-auto">
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vItem) => {
            const record = filtered[vItem.index]
            const isChecked = !!checked[record.id]
            const isCurrent = record.id === currentId
            const conf = record._avgConfidence
            const globalIdx = records.indexOf(record)

            return (
              <div
                key={record.id}
                data-index={vItem.index}
                ref={virtualizer.measureElement}
                style={{ position: 'absolute', top: vItem.start, left: 0, right: 0 }}
              >
                <button
                  onClick={() => onSelect(record.id)}
                  className={`w-full text-left px-2 py-2 border-b border-gray-100 transition ${
                    isCurrent ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-400 w-6 flex-shrink-0">
                      {globalIdx + 1}
                    </span>
                    {isChecked ? (
                      <span className="text-green-500 text-xs">✓</span>
                    ) : (
                      <span className="text-gray-300 text-xs">○</span>
                    )}
                    <span className="text-xs font-medium text-gray-700 truncate flex-1">
                      {record.id}
                    </span>
                    {conf !== null && (
                      <span
                        className={`text-xs flex-shrink-0 ${
                          conf >= 0.9 ? 'text-green-600' : conf >= 0.7 ? 'text-yellow-600' : 'text-red-500'
                        }`}
                      >
                        {Math.round(conf * 100)}%
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate pl-7 mt-0.5">{record.text}</p>
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
