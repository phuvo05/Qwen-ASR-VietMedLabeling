import { useMemo } from 'react'
import type { WordTimestamp } from '@/types'

export function useWordHighlight(timestamps: WordTimestamp[], currentTime: number): number {
  return useMemo(() => {
    if (!timestamps.length) return -1
    for (let i = 0; i < timestamps.length; i++) {
      if (currentTime >= timestamps[i].start && currentTime <= timestamps[i].end) return i
    }
    // Find the last word whose start <= currentTime
    for (let i = timestamps.length - 1; i >= 0; i--) {
      if (timestamps[i].start <= currentTime) return i
    }
    return -1
  }, [timestamps, currentTime])
}
