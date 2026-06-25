export interface WordTimestamp {
  word: string
  confidence: number
  start: number
  end: number
}

export interface DatasetRecord {
  id: string
  text: string
  timestamps: WordTimestamp[]
  _avgConfidence: number | null
}

export interface CheckedEntry {
  checked_at: string
  original_transcript: string
  checked_by?: string
}

export interface AudioMetadata {
  filename: string
  s3_key: string
  sample_rate: number
  duration_seconds: number
  num_channels: number
  num_samples: number
  format: string
}

export type FilterMode = 'all' | 'checked' | 'unchecked'
