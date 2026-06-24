import { describe, it, expect } from 'vitest'
import { parseDataset } from '@/lib/jsonlParser'

const SAMPLE_RECORD = {
  id: 'VietMed_un_001_s05OFV.wav',
  text: 'áp ứng miễn dịch',
  timestamps: [
    { word: 'áp', confidence: 0.5, start: 0.0, end: 0.16 },
    { word: 'ứng', confidence: 1.0, start: 0.16, end: 0.32 },
    { word: 'miễn', confidence: 0.75, start: 0.32, end: 0.48 },
  ],
}

describe('parseDataset', () => {
  it('parses a JSON array', () => {
    const input = JSON.stringify([SAMPLE_RECORD])
    const result = parseDataset(input)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('VietMed_un_001_s05OFV.wav')
    expect(result[0].text).toBe('áp ứng miễn dịch')
  })

  it('computes average confidence from timestamps', () => {
    const input = JSON.stringify([SAMPLE_RECORD])
    const result = parseDataset(input)
    // (0.5 + 1.0 + 0.75) / 3 = 0.75
    expect(result[0]._avgConfidence).toBeCloseTo(0.75, 2)
  })

  it('parses JSONL (newline-delimited JSON)', () => {
    const line1 = JSON.stringify(SAMPLE_RECORD)
    const line2 = JSON.stringify({ ...SAMPLE_RECORD, id: 'VietMed_un_001_s0FKCE.wav' })
    const result = parseDataset(`${line1}\n${line2}`)
    expect(result).toHaveLength(2)
  })

  it('skips blank lines in JSONL', () => {
    const line = JSON.stringify(SAMPLE_RECORD)
    const result = parseDataset(`${line}\n\n`)
    expect(result).toHaveLength(1)
  })

  it('sets _avgConfidence to null when timestamps is empty', () => {
    const input = JSON.stringify([{ ...SAMPLE_RECORD, timestamps: [] }])
    const result = parseDataset(input)
    expect(result[0]._avgConfidence).toBeNull()
  })

  it('extracts basename from full POSIX path id', () => {
    const fullPath = { ...SAMPLE_RECORD, id: 'datasets/phuuvt/VietMed/VietMed_un_001_s05OFV.wav' }
    const result = parseDataset(JSON.stringify([fullPath]))
    expect(result[0].id).toBe('VietMed_un_001_s05OFV.wav')
  })

  it('extracts basename from full Windows path id', () => {
    const fullPath = { ...SAMPLE_RECORD, id: 'datasets\\phuuvt\\VietMed\\VietMed_un_001_s05OFV.wav' }
    const result = parseDataset(JSON.stringify([fullPath]))
    expect(result[0].id).toBe('VietMed_un_001_s05OFV.wav')
  })

  it('leaves plain filename id unchanged', () => {
    const result = parseDataset(JSON.stringify([SAMPLE_RECORD]))
    expect(result[0].id).toBe('VietMed_un_001_s05OFV.wav')
  })
})
