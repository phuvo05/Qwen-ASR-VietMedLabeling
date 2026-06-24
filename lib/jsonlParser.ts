import type { DatasetRecord } from '@/types'

export function parseDataset(content: string): DatasetRecord[] {
  const trimmed = content.trim()
  let raw: unknown[]

  if (trimmed.startsWith('[')) {
    raw = JSON.parse(trimmed)
  } else {
    raw = trimmed
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line))
  }

  return (raw as Record<string, unknown>[]).map((record) => {
    const timestamps = Array.isArray(record.timestamps)
      ? (record.timestamps as { word: string; confidence: number; start: number; end: number }[])
      : []

    const _avgConfidence =
      timestamps.length > 0
        ? timestamps.reduce((sum, t) => sum + t.confidence, 0) / timestamps.length
        : null

    const rawId = String(record.id ?? '').trim()
    const id = rawId.split('/').pop()?.split('\\').pop() ?? rawId

    return {
      id,
      text: String(record.text ?? ''),
      timestamps,
      _avgConfidence,
    }
  })
}
