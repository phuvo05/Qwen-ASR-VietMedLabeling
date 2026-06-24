# ASR Labeling Tool

Manual review tool for Vietnamese medical ASR pseudo-labels.

## Quick Start (Local Development)

### 1. Frontend

```bash
npm install
cp .env.local.example .env.local
npm run dev          # http://localhost:3000
```

### 2. Backend

```bash
pip install -r backend/requirements.txt
# Copy and fill backend/.env
cp backend/.env.example backend/.env
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. System dependencies (for mp3/m4a support)

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

1. Create a private S3 bucket
2. Set `AWS_BUCKET_NAME` and `AWS_REGION` in `backend/.env`
3. Either attach an IAM Role to EC2, or set `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`

Required IAM permissions:
```json
{
  "Effect": "Allow",
  "Action": ["s3:PutObject", "s3:GetObject", "s3:ListBucket"],
  "Resource": ["arn:aws:s3:::YOUR_BUCKET", "arn:aws:s3:::YOUR_BUCKET/*"]
}
```

---

## EC2 Deployment

```bash
# Clone repo
git clone <repo-url> /home/ubuntu/asr-labeling
cd /home/ubuntu/asr-labeling

# Build frontend
npm install && npm run build

# Install backend
pip install -r backend/requirements.txt

# Nginx
sudo cp nginx/asr-labeling.conf /etc/nginx/sites-available/asr-labeling
sudo ln -s /etc/nginx/sites-available/asr-labeling /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# PM2
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

## Usage

### Workflow

1. **Upload JSON** — click "Upload JSON / JSONL" in sidebar. Supports arrays and newline-delimited JSONL.
2. **Upload audio** — click "Upload Audio". Multiple files accepted. Backend validates with `soundfile`, stores in S3.
3. **Select item** — click any item in the sidebar list. Waveform loads automatically if audio is uploaded.
4. **Listen & review** — use play controls or `Space` to play/pause. Words highlight in sync with audio.
5. **Edit transcript** — pause, then click the transcript text to switch to edit mode.
6. **Mark checked** — press `Enter` or click "Mark Checked".
7. **Export** — click "Export checked_ids.json" to download results.

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate items |
| `Space` | Play / Pause audio |
| `Enter` | Mark current item checked |
| `Ctrl+S` | Mark current item checked |
| `Ctrl+C` | Copy current item **ID** |

### JSON Format

```json
[
  {
    "id": "VietMed_un_001_s05OFV.wav",
    "text": "transcript text here",
    "timestamps": [
      { "word": "transcript", "confidence": 0.99, "start": 0.0, "end": 0.48 }
    ]
  }
]
```

### Export Format (`checked_ids.json`)

```json
[
  {
    "id": "VietMed_un_001_s05OFV.wav",
    "filename": "VietMed_un_001_s05OFV.wav",
    "index": 0,
    "checked_at": "2026-06-24T10:30:00.000Z",
    "original_transcript": "original text",
    "edited_transcript": "corrected text"
  }
]
```

---

## Running Tests

```bash
# Frontend
npm test

# Backend
python -m pytest backend/tests/ -v
```
