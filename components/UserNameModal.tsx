'use client'
import { useState } from 'react'

interface Props {
  onConfirm: (name: string) => void
}

export default function UserNameModal({ onConfirm }: Props) {
  const [name, setName] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onConfirm(trimmed)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-80">
        <h2 className="text-lg font-bold text-gray-800 mb-1">Xin chào!</h2>
        <p className="text-sm text-gray-500 mb-4">
          Nhập tên của bạn để bắt đầu gán nhãn
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            autoFocus
            type="text"
            placeholder="Tên của bạn..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40 transition"
          >
            Bắt đầu
          </button>
        </form>
      </div>
    </div>
  )
}
