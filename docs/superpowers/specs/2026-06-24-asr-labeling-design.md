# ASR Pseudo-Label Manual Review Tool — Design Spec

**Date:** 2026-06-24  
**Project:** Qwen-ASR-VietMedLabeling  
**Status:** Approved

---

## Overview

A web app for manually reviewing Vietnamese medical ASR pseudo-labels. Users upload a JSON file containing ASR predictions with per-word timestamps, upload audio files, listen to each clip, verify or edit the transcript, and export a checked dataset.

---

## 1. Architecture

```
EC2 Instance
├── Nginx (port 80)
│   ├── /      → Next.js  :3000
│   └── /api/  → FastAPI  :8000
│
├── Next.js :3000  (React SPA)
└── FastAPI :8000  (Python audio backend)

AWS S3 (private bucket)
└── audio/{filename}   ← uploaded audio files
```

**Project structure (Option B — Next.js at root):**
```
/
├── app/                  ← Next.js app router
├── components/
├── hooks/
├── lib/
├── backend/              ← Python FastAPI subfolder
│   ├── main.py
│   ├── routers/
│   ├── services/
│   ├── models.py
│   └── config.py
├── .env.local            ← NEXT_PUBLIC_API_URL=http://localhost:8000
└── README.md
```

**State:**
- JSON dataset + checked progress + edited transcripts → `localStorage`
- Audio files → AWS S3 (persisted across restarts)
- No database

---

## 2. JSON Input Format

Confirmed format from VietMed dataset:

```json
{
  "id": "VietMed_un_001_s05OFV.wav",
  "text": "...",
  "timestamps": [
    { "word": "áp", "confidence": 0.483, "start": 0.0, "end": 0.16 },
    ...
  ]
}
```

**Field mapping (hardcoded, not auto-detected):**
- `id` → record identifier AND audio filename
- `text` → transcript
- `timestamps[].confidence` → average computed as overall confidence
- `timestamps[].start/end` → word-level timing for highlight

**JSONL support:** Parser splits on newlines, parses each line as JSON object.

---

## 3. Frontend Components

### Layout (2-column, desktop-first)

```
┌─────────────────────┬──────────────────────────────────────┐
│  Left Panel (320px) │  Right Panel (flex-grow)             │
│                     │                                       │
│  [JsonUploader]     │  [WaveformPlayer]                    │
│  [ProgressBar]      │    waveform + play/pause/seek/vol    │
│  [AudioUploader]    │                                       │
│  ─────────────────  │  [TranscriptEditor]                  │
│  search + filter    │    word-highlight view (play mode)   │
│  [ItemSidebar]      │    editable textarea (edit mode)     │
│    - list items     │    Save / Mark Checked / Copy        │
│    - checked ✓      │                                       │
│    - confidence %   │  [ExportPanel]                       │
└─────────────────────┴──────────────────────────────────────┘
```

### Component List

| Component | Responsibility |
|-----------|---------------|
| `JsonUploader` | Upload .json/.jsonl, parse, store to localStorage |
| `ProgressBar` | total / checked / % bar |
| `AudioUploader` | Upload audio → POST /api/upload-audio → get metadata |
| `ItemSidebar` | Virtualized list, search, filter (All/Checked/Unchecked), highlight selected |
| `WaveformPlayer` | WaveSurfer.js, play/pause, ±5s seek, volume, current time/duration |
| `TranscriptEditor` | Play mode (word highlight) + Edit mode (textarea), Save/Check/Uncheck/Copy |
| `ExportPanel` | Export checked_ids.json, Export full JSON, Import checked_ids.json |

### Hooks

| Hook | Responsibility |
|------|---------------|
| `useDataset` | Load/persist dataset to localStorage, check/uncheck, edit transcript |
| `useAudioMatch` | Match selected item `id` → call `/api/presigned-url/{id}` |
| `useKeyboard` | Global shortcuts |
| `useWordHighlight` | Track current playback time → find active word in timestamps |

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑` / `↓` | Previous / Next item in sidebar |
| `Space` | Play / Pause audio |
| `Enter` or `Ctrl+S` | Mark current item as checked |
| `Ctrl+C` | Copy current item **ID** to clipboard |

### Transcript Display Modes

- **Play mode** (audio playing): Read-only. Each word rendered as `<span>`. Active word highlighted based on `timestamps[].start/end` vs `currentTime`.
- **Edit mode** (paused or no audio): Standard `<textarea>`. Switches automatically on pause, or when user clicks the text area.

### Sidebar Item Display

Each item shows:
- Index number
- `id` (truncated if long)
- Checked ✓ icon or unchecked circle
- Average confidence % (computed from `timestamps[].confidence`)

### Virtualization

Use `@tanstack/react-virtual` for the sidebar list. Renders only visible items — supports datasets of 5000+ records without performance issues.

---

## 4. Backend API (FastAPI)

### Directory Structure

```
backend/
├── main.py            ← app init, CORS, router mount
├── routers/
│   ├── audio.py       ← upload, presigned URL, list
│   └── health.py
├── services/
│   ├── s3_service.py  ← boto3 wrapper
│   └── audio_service.py  ← soundfile + ffmpeg fallback
├── models.py          ← Pydantic schemas
└── config.py          ← env vars via pydantic-settings
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/upload-audio` | Validate with soundfile, upload to S3, return metadata |
| `GET` | `/api/presigned-url/{filename}` | Return S3 presigned GET URL (TTL 1h) |
| `GET` | `/api/list-audio` | List all audio keys in S3 bucket |
| `GET` | `/health` | Health check |

### Audio Upload Flow

```
1. Receive multipart/form-data (1+ files)
2. Save to /tmp/{filename}
3. soundfile.read() → sample_rate, duration, channels, num_samples, format
4. If soundfile fails → ffmpeg -i input.mp3 -ar 16000 /tmp/{filename}.wav → retry soundfile
5. Upload original file to S3: audio/{filename}
6. Delete /tmp file
7. Return AudioMetadata[]
```

### AudioMetadata Response Schema

```json
{
  "filename": "VietMed_un_001_s05OFV.wav",
  "s3_key": "audio/VietMed_un_001_s05OFV.wav",
  "sample_rate": 16000,
  "duration_seconds": 3.42,
  "num_channels": 1,
  "num_samples": 54720,
  "format": "WAV"
}
```

### Error Handling

- `soundfile` fails AND `ffmpeg` not available → HTTP 422 with clear message
- File not found in S3 → presigned-url endpoint returns HTTP 404
- Upload to S3 fails → HTTP 500 with error detail

---

## 5. Audio Matching Logic

When user selects an item in the sidebar:
1. Take `id` field from record (e.g., `VietMed_un_001_s05OFV.wav`)
2. Call `GET /api/presigned-url/VietMed_un_001_s05OFV.wav`
3. If 200 → WaveSurfer loads presigned URL
4. If 404 → show banner: *"Audio chưa được upload — upload file có tên [id] để tiếp tục"*
5. After new audio upload → auto-retry match for currently selected item

---

## 6. State & localStorage Schema

```ts
interface LocalStorageState {
  asr_dataset: DatasetRecord[];         // full parsed JSON array
  asr_checked: Record<string, CheckedEntry>;  // id → checked state + timestamps
  asr_edited:  Record<string, string>;        // id → edited transcript text
  asr_current_id: string;               // last selected item id
}

interface DatasetRecord {
  id: string;
  text: string;
  timestamps: WordTimestamp[];
  _avgConfidence: number;  // computed on load
}

interface CheckedEntry {
  checked_at: string;          // ISO datetime
  original_transcript: string;
}
```

---

## 7. Export Formats

### `checked_ids.json` (default export)

```json
[
  {
    "id": "VietMed_un_001_s05OFV.wav",
    "filename": "VietMed_un_001_s05OFV.wav",
    "index": 0,
    "checked_at": "2026-06-24T10:30:00.000Z",
    "original_transcript": "áp ứng miễn dịch của ruồi giấm...",
    "edited_transcript": "đáp ứng miễn dịch của ruồi giấm..."
  }
]
```

### Full reviewed JSON (includes all records)

Original JSON structure + appended fields:
```json
{
  "id": "...",
  "text": "...",
  "timestamps": [...],
  "checked": true,
  "edited_transcript": "...",
  "checked_at": "2026-06-24T10:30:00.000Z"
}
```

### Import

Upload `checked_ids.json` → restore `asr_checked` and `asr_edited` in localStorage. Merges with current dataset (does not overwrite unchecked items).

---

## 8. Deployment

### EC2 Setup

```bash
# Install
sudo apt install nginx python3-pip nodejs npm ffmpeg
pip install fastapi uvicorn soundfile python-multipart boto3 pydantic-settings
npm install -g pm2

# Run
pm2 start "npm start" --name frontend      # Next.js port 3000
pm2 start "uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload" --name backend

# Nginx /etc/nginx/sites-available/asr-labeling
server {
  listen 80;
  location /api/ { proxy_pass http://localhost:8000/api/; }
  location /     { proxy_pass http://localhost:3000; }
}
```

### AWS S3

- Private bucket (no public access)
- Backend uses IAM Role (preferred) or `.env` credentials
- Presigned URLs for audio playback (TTL: 1 hour)
- Backend env vars: `AWS_BUCKET_NAME`, `AWS_REGION`

### Environment Variables

```
# .env.local (Next.js)
NEXT_PUBLIC_API_URL=http://localhost:8000

# backend/.env
AWS_BUCKET_NAME=your-bucket
AWS_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=...       # only if not using IAM Role
AWS_SECRET_ACCESS_KEY=...   # only if not using IAM Role
```

---

## 9. Edge Cases

| Case | Handling |
|------|----------|
| JSONL input | Parse line-by-line, skip blank lines |
| Record missing `timestamps` | `_avgConfidence` = null, highlight feature disabled |
| Audio not uploaded | Banner with exact filename needed |
| Audio uploaded after item selected | Auto-retry presigned URL fetch |
| Presigned URL expires during session | Re-fetch on WaveSurfer error event |
| Large dataset (5000+ records) | React-virtual for sidebar, lazy load waveform |
| `.mp3`/`.m4a` not readable by soundfile | ffmpeg convert → .wav → soundfile re-read |
| localStorage full | Warn user, suggest exporting and reimporting |

---

## 10. Python Dependencies

```
fastapi
uvicorn[standard]
soundfile
python-multipart
boto3
pydantic-settings
```

Optional (for mp3/m4a support):
```
# System: sudo apt install ffmpeg
```

## 11. Frontend Dependencies

```json
{
  "wavesurfer.js": "^7.x",
  "@tanstack/react-virtual": "^3.x",
  "next": "14.x",
  "typescript": "^5.x",
  "tailwindcss": "^3.x"
}
```
