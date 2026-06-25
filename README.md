# ASR Labeling Tool — VietMed

Web-based manual review tool for Vietnamese medical ASR pseudo-labels. Built for multi-user labeling workflows: dataset and check state are stored server-side so every reviewer sees the same data in real time.

![UI Screenshot](images/Screenshot%202026-06-25%20105643.png)

---

## Features

- **Waveform playback** — WaveSurfer.js with word-level highlight synchronized to audio position
- **Word-level confidence** — per-item confidence score from ASR timestamps
- **Transcript editing** — inline editor with save-to-server persistence
- **Multi-user sync** — checked state and edited transcripts shared across all users via backend storage
- **Drag-and-drop audio upload** — `.wav .mp3 .m4a .flac` supported; stored in AWS S3
- **Sidebar search & filter** — search by ID or transcript text, filter by Tất Cả / Chưa Check / Đã Check
- **Progress tracking** — live counter and progress bar (e.g. 164/1706 checked)
- **Keyboard shortcuts** — navigate, play/pause, mark checked without touching the mouse
- **Export** — `checked_ids.json` (IDs only) or full reviewed JSONL with edited transcripts

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14, React 18, TailwindCSS, WaveSurfer.js v7 |
| Backend | FastAPI, Python 3.11, soundfile / ffmpeg |
| Storage | AWS S3 (audio), server-side JSON files (dataset, checked state, edits) |
| Infra | EC2 (Ubuntu), Nginx reverse proxy, PM2 |

---

## Quick Start (Local)

### 1. Frontend

```bash
npm install
cp .env.local.example .env.local   # set NEXT_PUBLIC_API_URL if needed
npm run dev                         # http://localhost:3000
```

### 2. Backend

```bash
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env   # fill in AWS credentials
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. System dependencies (mp3/m4a support)

**Ubuntu/Debian:**
```bash
sudo apt install ffmpeg
```

**macOS:**
```bash
brew install ffmpeg
```

---

## AWS S3 Setup

1. Create a private S3 bucket in `ap-southeast-1` (or your region)
2. Set credentials in `backend/.env`:

```env
AWS_BUCKET_NAME=your-bucket-name
AWS_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

Required IAM permissions:

```json
{
  "Effect": "Allow",
  "Action": ["s3:PutObject", "s3:GetObject", "s3:ListBucket"],
  "Resource": [
    "arn:aws:s3:::YOUR_BUCKET",
    "arn:aws:s3:::YOUR_BUCKET/*"
  ]
}
```

On EC2 with an attached IAM Role you can omit the access key variables.

---

## EC2 Deployment

```bash
# Clone
git clone <repo-url> /home/ubuntu/asr-labeling
cd /home/ubuntu/asr-labeling

# Frontend
npm install
echo "NEXT_PUBLIC_API_URL=" > .env.local   # empty = use relative URLs via Nginx
npm run build

# Backend
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env       # fill in AWS credentials

# Nginx reverse proxy  (/api/ → localhost:8000)
sudo cp nginx/asr-labeling.conf /etc/nginx/sites-available/asr-labeling
sudo ln -s /etc/nginx/sites-available/asr-labeling /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# PM2 process manager
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

To deploy updates:

```bash
git pull
npm run build
pm2 restart all
```

---

## Usage

### Workflow

1. **Load dataset** — upload a `.json` / `.jsonl` file via the sidebar (or use one already loaded by another user). The dataset auto-loads from the server on page open.
2. **Upload audio** — click "Upload Audio" or drag-and-drop files. Multiple files at once are supported.
3. **Select item** — click any item in the sidebar list. The waveform loads automatically.
4. **Listen & review** — press `Space` to play/pause. Words in the transcript highlight in sync with audio playback.
5. **Edit transcript** — click "Chỉnh sửa", type your correction, click "Lưu chỉnh sửa". Changes are saved to the server immediately.
6. **Mark checked** — press `Enter` or click "Mark Checked". The item turns green in the sidebar. All users see the update instantly.
7. **Export** — click "Export checked_ids.json" or "Export full reviewed JSON" at the bottom.

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate items in sidebar |
| `Space` | Play / Pause audio |
| `Enter` | Mark current item checked |
| `Ctrl+S` | Mark current item checked |
| `Ctrl+C` | Copy current item ID |

### Input Format (JSON / JSONL)

```json
[
  {
    "id": "VietMed_un_409_s06ABI.wav",
    "text": "có thể là hoàn toàn vẫn có thể là hai bệnh khác nhau",
    "timestamps": [
      { "word": "có", "confidence": 0.99, "start": 0.0, "end": 0.18 },
      { "word": "thể", "confidence": 0.98, "start": 0.2, "end": 0.42 }
    ]
  }
]
```

JSONL (one object per line) is also supported. The `timestamps` field is optional — without it the transcript displays as plain text.

### Export Format

**`checked_ids.json`** (compact, for downstream pipelines):

```json
[
  {
    "id": "VietMed_un_409_s06ABI.wav",
    "filename": "VietMed_un_409_s06ABI.wav",
    "index": 1,
    "checked_at": "2026-06-25T10:30:00.000Z",
    "original_transcript": "có thể là hoàn toàn ...",
    "edited_transcript": "có thể là hoàn toàn ..."
  }
]
```

**`Export full reviewed JSON`** — same as above but includes every record in the dataset (checked and unchecked), with an `is_checked` flag.

---

## Server-Side Storage

All persistent state lives under `backend/data/` (not in git):

| File | Contents |
|------|----------|
| `default_dataset.jsonl` | The active dataset, auto-loaded on page open |
| `checked.json` | `{ id: { checked_at, original_transcript } }` — shared across users |
| `edited.json` | `{ id: edited_transcript }` — shared across users |

Concurrent writes are protected by a `threading.Lock`.

---

## Running Tests

```bash
# Frontend (Vitest)
npm test

# Backend (pytest)
python -m pytest backend/tests/ -v
```
