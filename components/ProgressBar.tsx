interface Props {
  total: number
  checked: number
}

export default function ProgressBar({ total, checked }: Props) {
  const pct = total === 0 ? 0 : Math.round((checked / total) * 100)
  return (
    <div className="px-3 py-2 bg-white border border-gray-200 rounded-lg">
      <div className="flex justify-between text-xs text-gray-600 mb-1">
        <span>{checked}/{total} đã check</span>
        <span className="font-semibold text-blue-600">{pct}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
