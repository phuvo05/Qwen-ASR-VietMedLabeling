# ASR Pseudo-Label Manual Review Tool — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web app for manually reviewing Vietnamese medical ASR pseudo-labels — upload JSON predictions, listen to audio, verify/edit transcripts, export checked results.

**Architecture:** Next.js 14 (App Router) frontend at root + FastAPI Python backend in `/backend` subfolder, both running on EC2 behind Nginx. Audio files stored in AWS S3, served via presigned URLs. All labeling state persisted in browser localStorage.

**Tech Stack:** Next.js 14, TypeScript, TailwindCSS, WaveSurfer.js v7, @tanstack/react-virtual, FastAPI, soundfile, boto3, ffmpeg (system), AWS S3.

## Global Constraints

- Node.js 18+; Python 3.10+
- Next.js 14.x with App Router (`app/` directory), not Pages Router
- All client components require `"use client"` directive
- API base URL read from `NEXT_PUBLIC_API_URL` env var (default `http://localhost:8000`)
- S3 bucket name from `AWS_BUCKET_NAME` env var; region from `AWS_REGION`
- Backend runs on port 8000; frontend on port 3000
- All audio stored in S3 under prefix `audio/`
- Presigned URLs TTL: 3600 seconds (1 hour)
- JSON field mapping is hardcoded: `id`, `text`, `timestamps[].{word,confidence,start,end}`
- `id` field equals the audio filename (e.g., `VietMed_un_001_s05OFV.wav`)
- Average confidence computed as mean of `timestamps[].confidence`
- Sidebar list uses virtual rendering for datasets >100 items
- localStorage keys: `asr_dataset`, `asr_checked`, `asr_edited`, `asr_current_id`

---

## File Map

```
/ (project root)
├── app/
│   ├── layout.tsx               ← root layout, global styles
│   ├── page.tsx                 ← 2-column layout orchestrator
│   └── globals.css
├── components/
│   ├── JsonUploader.tsx         ← file input → parse → load dataset
│   ├── ProgressBar.tsx          ← total / checked / % display
│   ├── AudioUploader.tsx        ← upload audio files to backend
│   ├── ItemSidebar.tsx          ← virtualized list, search, filter
│   ├── WaveformPlayer.tsx       ← WaveSurfer.js wrapper
│   ├── TranscriptEditor.tsx     ← play mode highlight + edit mode textarea
│   └── ExportPanel.tsx          ← export/import checked results
├── hooks/
│   ├── useDataset.ts            ← dataset state + localStorage persistence
│   ├── useAudioMatch.ts         ← id → presigned URL fetch + retry
│   ├── useWordHighlight.ts      ← currentTime → active word index
│   └── useKeyboard.ts           ← global keyboard shortcuts
├── lib/
│   ├── jsonlParser.ts           ← parse .json / .jsonl → DatasetRecord[]
│   └── apiClient.ts             ← fetch wrapper with base URL
├── types/
│   └── index.ts                 ← shared TypeScript interfaces
├── __tests__/
│   └── lib/
│       └── jsonlParser.test.ts  ← vitest tests for parser
├── backend/
│   ├── main.py                  ← FastAPI app, CORS, router mount
│   ├── config.py                ← pydantic-settings env config
│   ├── models.py                ← Pydantic response schemas
│   ├── routers/
│   │   ├── audio.py             ← /api/upload-audio, /api/presigned-url, /api/list-audio
│   │   └── health.py            ← GET /health
│   ├── services/
│   │   ├── s3_service.py        ← boto3 upload, presigned URL, list
│   │   └── audio_service.py     ← soundfile read + ffmpeg fallback
│   ├── requirements.txt
│   └── tests/
│       ├── conftest.py
│       ├── test_audio_service.py
│       ├── test_s3_service.py
│       └── test_audio_endpoints.py
├── .env.local.example
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

---

## Task 1: Project Scaffolding & Shared Types

**Files:**
- Create: `package.json`, `next.config.ts`, `tailwind.config.ts`, `tsconfig.json`, `vitest.config.ts`
- Create: `types/index.ts`
- Create: `app/layout.tsx`, `app/globals.css`
- Create: `backend/requirements.txt`
- Create: `.env.local.example`

**Interfaces:**
- Produces:
  ```ts
  // types/index.ts — used by ALL subsequent tasks
  interface WordTimestamp { word: string; confidence: number; start: number; end: number }
  interface DatasetRecord { id: string; text: string; timestamps: WordTimestamp[]; _avgConfidence: number | null }
  interface CheckedEntry { checked_at: string; original_transcript: string }
  interface AudioMetadata { filename: string; s3_key: string; sample_rate: number; duration_seconds: number; num_channels: number; num_samples: number; format: string }
  ```

- [ ] **Step 1: Scaffold Next.js project**

```bash
cd D:\Qwen-ASR-VietMedLabeling
npx create-next-app@14 . --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --yes
```

Expected: Next.js files created at root. `package.json` present.

- [ ] **Step 2: Install frontend dependencies**

```bash
npm install wavesurfer.js @tanstack/react-virtual
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 3: Create vitest config**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

Create `vitest.setup.ts`:
```ts
import '@testing-library/jest-dom'
```

Add to `package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Create shared types**

Create `types/index.ts`:
```ts
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
```

- [ ] **Step 5: Update app/layout.tsx**

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ASR Labeling Tool',
  description: 'Vietnamese medical ASR pseudo-label review',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  )
}
```

- [ ] **Step 6: Create backend requirements**

Create `backend/requirements.txt`:
```
fastapi==0.111.0
uvicorn[standard]==0.30.1
python-multipart==0.0.9
soundfile==0.12.1
boto3==1.34.0
pydantic-settings==2.3.0
moto[s3]==5.0.0
pytest==8.2.0
pytest-asyncio==0.23.7
httpx==0.27.0
```

- [ ] **Step 7: Create .env.local.example**

Create `.env.local.example`:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Create `backend/.env.example`:
```
AWS_BUCKET_NAME=your-bucket-name
AWS_REGION=ap-southeast-1
# Only if not using IAM Role:
# AWS_ACCESS_KEY_ID=...
# AWS_SECRET_ACCESS_KEY=...
```

- [ ] **Step 8: Create backend folder structure**

```bash
mkdir -p backend/routers backend/services backend/tests
touch backend/__init__.py backend/routers/__init__.py backend/services/__init__.py
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js + FastAPI project with shared types"
```

---

## Task 2: FastAPI Backend Foundation

**Files:**
- Create: `backend/config.py`
- Create: `backend/models.py`
- Create: `backend/routers/health.py`
- Create: `backend/main.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_health.py`

**Interfaces:**
- Produces:
  - `GET /health` → `{"status": "ok"}`
  - `app` FastAPI instance importable as `from backend.main import app`
  - `settings` importable as `from backend.config import settings`

- [ ] **Step 1: Write failing health test**

Create `backend/tests/conftest.py`:
```python
import pytest
from fastapi.testclient import TestClient
from backend.main import app

@pytest.fixture
def client():
    return TestClient(app)
```

Create `backend/tests/test_health.py`:
```python
def test_health_returns_ok(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd D:\Qwen-ASR-VietMedLabeling
python -m pytest backend/tests/test_health.py -v
```

Expected: `ERROR` — `ModuleNotFoundError: No module named 'backend'`

- [ ] **Step 3: Implement config, models, health router, main**

Create `backend/config.py`:
```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    aws_bucket_name: str = "asr-labeling-bucket"
    aws_region: str = "ap-southeast-1"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""

    class Config:
        env_file = "backend/.env"
        extra = "ignore"

settings = Settings()
```

Create `backend/models.py`:
```python
from pydantic import BaseModel

class HealthResponse(BaseModel):
    status: str

class AudioMetadata(BaseModel):
    filename: str
    s3_key: str
    sample_rate: int
    duration_seconds: float
    num_channels: int
    num_samples: int
    format: str

class PresignedUrlResponse(BaseModel):
    url: str
    filename: str
    expires_in: int

class ListAudioResponse(BaseModel):
    files: list[str]
    count: int

class ErrorResponse(BaseModel):
    detail: str
```

Create `backend/routers/health.py`:
```python
from fastapi import APIRouter
from backend.models import HealthResponse

router = APIRouter()

@router.get("/health", response_model=HealthResponse)
def health():
    return HealthResponse(status="ok")
```

Create `backend/main.py`:
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.routers import health

app = FastAPI(title="ASR Labeling Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
python -m pytest backend/tests/test_health.py -v
```

Expected: `PASSED`

- [ ] **Step 5: Verify server starts**

```bash
uvicorn backend.main:app --port 8000 --reload
# In another terminal:
curl http://localhost:8000/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 6: Commit**

```bash
git add backend/
git commit -m "feat: add FastAPI backend foundation with health endpoint"
```

---

## Task 3: S3 Service

**Files:**
- Create: `backend/services/s3_service.py`
- Create: `backend/tests/test_s3_service.py`

**Interfaces:**
- Consumes: `from backend.config import settings`
- Produces:
  ```python
  upload_file(local_path: str, s3_key: str) -> None
  get_presigned_url(s3_key: str, expires_in: int = 3600) -> str
  list_audio_files() -> list[str]  # returns list of filenames (no prefix)
  key_exists(s3_key: str) -> bool
  ```

- [ ] **Step 1: Write failing S3 service tests**

Create `backend/tests/test_s3_service.py`:
```python
import os
import pytest
import boto3
from moto import mock_aws
from unittest.mock import patch
from backend.services.s3_service import upload_file, get_presigned_url, list_audio_files, key_exists

BUCKET = "test-bucket"
REGION = "ap-southeast-1"

@pytest.fixture(autouse=True)
def aws_credentials():
    os.environ["AWS_ACCESS_KEY_ID"] = "testing"
    os.environ["AWS_SECRET_ACCESS_KEY"] = "testing"
    os.environ["AWS_SECURITY_TOKEN"] = "testing"
    os.environ["AWS_SESSION_TOKEN"] = "testing"
    os.environ["AWS_DEFAULT_REGION"] = REGION

@pytest.fixture
def s3_bucket(aws_credentials):
    with mock_aws():
        s3 = boto3.client("s3", region_name=REGION)
        s3.create_bucket(
            Bucket=BUCKET,
            CreateBucketConfiguration={"LocationConstraint": REGION},
        )
        with patch("backend.services.s3_service.settings.aws_bucket_name", BUCKET):
            yield s3

def test_upload_and_key_exists(s3_bucket, tmp_path):
    f = tmp_path / "test.wav"
    f.write_bytes(b"RIFF" + b"\x00" * 40)
    with mock_aws():
        upload_file(str(f), "audio/test.wav")
        assert key_exists("audio/test.wav")

def test_list_audio_files(s3_bucket, tmp_path):
    f = tmp_path / "sample.wav"
    f.write_bytes(b"RIFF" + b"\x00" * 40)
    with mock_aws():
        upload_file(str(f), "audio/sample.wav")
        files = list_audio_files()
        assert "sample.wav" in files

def test_get_presigned_url(s3_bucket, tmp_path):
    f = tmp_path / "audio.wav"
    f.write_bytes(b"RIFF" + b"\x00" * 40)
    with mock_aws():
        upload_file(str(f), "audio/audio.wav")
        url = get_presigned_url("audio/audio.wav")
        assert url.startswith("https://")

def test_key_not_exists(s3_bucket):
    with mock_aws():
        assert not key_exists("audio/nonexistent.wav")
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest backend/tests/test_s3_service.py -v
```

Expected: `ERROR` — `ModuleNotFoundError: No module named 'backend.services.s3_service'`

- [ ] **Step 3: Implement S3 service**

Create `backend/services/s3_service.py`:
```python
import boto3
from botocore.exceptions import ClientError
from backend.config import settings

def _client():
    kwargs = {"region_name": settings.aws_region}
    if settings.aws_access_key_id:
        kwargs["aws_access_key_id"] = settings.aws_access_key_id
        kwargs["aws_secret_access_key"] = settings.aws_secret_access_key
    return boto3.client("s3", **kwargs)

def upload_file(local_path: str, s3_key: str) -> None:
    _client().upload_file(local_path, settings.aws_bucket_name, s3_key)

def get_presigned_url(s3_key: str, expires_in: int = 3600) -> str:
    return _client().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.aws_bucket_name, "Key": s3_key},
        ExpiresIn=expires_in,
    )

def list_audio_files() -> list[str]:
    paginator = _client().get_paginator("list_objects_v2")
    files = []
    for page in paginator.paginate(Bucket=settings.aws_bucket_name, Prefix="audio/"):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            filename = key.removeprefix("audio/")
            if filename:
                files.append(filename)
    return files

def key_exists(s3_key: str) -> bool:
    try:
        _client().head_object(Bucket=settings.aws_bucket_name, Key=s3_key)
        return True
    except ClientError:
        return False
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest backend/tests/test_s3_service.py -v
```

Expected: All 4 tests `PASSED`

- [ ] **Step 5: Commit**

```bash
git add backend/services/s3_service.py backend/tests/test_s3_service.py
git commit -m "feat: add S3 service (upload, list, presigned URL)"
```

---

## Task 4: Audio Service (soundfile + ffmpeg fallback)

**Files:**
- Create: `backend/services/audio_service.py`
- Create: `backend/tests/test_audio_service.py`
- Create: `backend/tests/fixtures/sine_16k.wav` (generated in test setup)

**Interfaces:**
- Produces:
  ```python
  read_audio_metadata(path: str) -> dict  
  # returns: {sample_rate, duration_seconds, num_channels, num_samples, format}
  # raises: ValueError with human-readable message on failure
  ```

- [ ] **Step 1: Write failing audio service test**

Create `backend/tests/test_audio_service.py`:
```python
import os
import struct
import wave
import pytest
from backend.services.audio_service import read_audio_metadata

@pytest.fixture
def wav_file(tmp_path):
    """Creates a valid 1-second mono 16kHz WAV file."""
    path = tmp_path / "test_16k.wav"
    num_samples = 16000
    with wave.open(str(path), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(b"\x00\x00" * num_samples)
    return str(path)

def test_read_wav_metadata(wav_file):
    meta = read_audio_metadata(wav_file)
    assert meta["sample_rate"] == 16000
    assert meta["num_channels"] == 1
    assert meta["num_samples"] == 16000
    assert abs(meta["duration_seconds"] - 1.0) < 0.01
    assert meta["format"] in ("WAV", "wav")

def test_invalid_file_raises_value_error(tmp_path):
    bad = tmp_path / "bad.wav"
    bad.write_bytes(b"not an audio file")
    with pytest.raises(ValueError, match="không đọc được"):
        read_audio_metadata(str(bad))
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest backend/tests/test_audio_service.py -v
```

Expected: `ERROR` — import error

- [ ] **Step 3: Implement audio service**

Create `backend/services/audio_service.py`:
```python
import os
import shutil
import subprocess
import tempfile
import soundfile as sf

def read_audio_metadata(path: str) -> dict:
    """Read audio metadata using soundfile; fallback to ffmpeg for mp3/m4a."""
    try:
        return _read_with_soundfile(path)
    except Exception as primary_err:
        if shutil.which("ffmpeg") is None:
            raise ValueError(
                f"File không đọc được bằng soundfile và ffmpeg không có sẵn: {primary_err}"
            )
        try:
            return _ffmpeg_convert_and_read(path)
        except Exception as ffmpeg_err:
            raise ValueError(
                f"File không đọc được bằng soundfile ({primary_err}) "
                f"hoặc ffmpeg ({ffmpeg_err})"
            )

def _read_with_soundfile(path: str) -> dict:
    info = sf.info(path)
    return {
        "sample_rate": info.samplerate,
        "duration_seconds": info.duration,
        "num_channels": info.channels,
        "num_samples": info.frames,
        "format": info.format,
    }

def _ffmpeg_convert_and_read(path: str) -> dict:
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", path, "-ar", "16000", "-ac", "1", tmp_path],
            capture_output=True,
            timeout=60,
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr.decode())
        return _read_with_soundfile(tmp_path)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest backend/tests/test_audio_service.py -v
```

Expected: Both tests `PASSED`

- [ ] **Step 5: Commit**

```bash
git add backend/services/audio_service.py backend/tests/test_audio_service.py
git commit -m "feat: add audio service with soundfile + ffmpeg fallback"
```

---

## Task 5: Audio API Endpoints

**Files:**
- Create: `backend/routers/audio.py`
- Modify: `backend/main.py` (add audio router)
- Create: `backend/tests/test_audio_endpoints.py`

**Interfaces:**
- Consumes: `upload_file`, `get_presigned_url`, `list_audio_files`, `key_exists` from `s3_service`; `read_audio_metadata` from `audio_service`
- Produces:
  - `POST /api/upload-audio` → `AudioMetadata[]`
  - `GET /api/presigned-url/{filename}` → `PresignedUrlResponse`
  - `GET /api/list-audio` → `ListAudioResponse`

- [ ] **Step 1: Write failing endpoint tests**

Create `backend/tests/test_audio_endpoints.py`:
```python
import io
import wave
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def make_wav_bytes() -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(b"\x00\x00" * 16000)
    return buf.getvalue()

@patch("backend.routers.audio.upload_file")
@patch("backend.routers.audio.read_audio_metadata")
def test_upload_audio_success(mock_meta, mock_upload):
    mock_meta.return_value = {
        "sample_rate": 16000,
        "duration_seconds": 1.0,
        "num_channels": 1,
        "num_samples": 16000,
        "format": "WAV",
    }
    mock_upload.return_value = None

    wav_bytes = make_wav_bytes()
    response = client.post(
        "/api/upload-audio",
        files=[("files", ("test.wav", wav_bytes, "audio/wav"))],
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["filename"] == "test.wav"
    assert data[0]["sample_rate"] == 16000

@patch("backend.routers.audio.key_exists", return_value=True)
@patch("backend.routers.audio.get_presigned_url", return_value="https://s3.example.com/audio/test.wav?sig=abc")
def test_presigned_url_found(mock_url, mock_exists):
    response = client.get("/api/presigned-url/test.wav")
    assert response.status_code == 200
    data = response.json()
    assert "url" in data
    assert data["filename"] == "test.wav"

@patch("backend.routers.audio.key_exists", return_value=False)
def test_presigned_url_not_found(mock_exists):
    response = client.get("/api/presigned-url/missing.wav")
    assert response.status_code == 404

@patch("backend.routers.audio.list_audio_files", return_value=["a.wav", "b.wav"])
def test_list_audio(mock_list):
    response = client.get("/api/list-audio")
    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 2
    assert "a.wav" in data["files"]
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest backend/tests/test_audio_endpoints.py -v
```

Expected: `FAILED` — router not mounted yet

- [ ] **Step 3: Implement audio router**

Create `backend/routers/audio.py`:
```python
import os
import tempfile
from fastapi import APIRouter, UploadFile, File, HTTPException
from backend.models import AudioMetadata, PresignedUrlResponse, ListAudioResponse
from backend.services.s3_service import upload_file, get_presigned_url, list_audio_files, key_exists
from backend.services.audio_service import read_audio_metadata

router = APIRouter(prefix="/api")

@router.post("/upload-audio", response_model=list[AudioMetadata])
async def upload_audio(files: list[UploadFile] = File(...)):
    results = []
    for file in files:
        suffix = os.path.splitext(file.filename)[1]
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name
        try:
            meta = read_audio_metadata(tmp_path)
        except ValueError as e:
            os.remove(tmp_path)
            raise HTTPException(status_code=422, detail=str(e))
        s3_key = f"audio/{file.filename}"
        upload_file(tmp_path, s3_key)
        os.remove(tmp_path)
        results.append(AudioMetadata(
            filename=file.filename,
            s3_key=s3_key,
            **meta,
        ))
    return results

@router.get("/presigned-url/{filename:path}", response_model=PresignedUrlResponse)
def presigned_url(filename: str):
    s3_key = f"audio/{filename}"
    if not key_exists(s3_key):
        raise HTTPException(status_code=404, detail=f"Audio '{filename}' chưa được upload")
    url = get_presigned_url(s3_key, expires_in=3600)
    return PresignedUrlResponse(url=url, filename=filename, expires_in=3600)

@router.get("/list-audio", response_model=ListAudioResponse)
def list_audio():
    files = list_audio_files()
    return ListAudioResponse(files=files, count=len(files))
```

Modify `backend/main.py` — add audio router:
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.routers import health, audio

app = FastAPI(title="ASR Labeling Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(audio.router)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest backend/tests/ -v
```

Expected: All tests `PASSED`

- [ ] **Step 5: Commit**

```bash
git add backend/routers/audio.py backend/main.py backend/tests/test_audio_endpoints.py
git commit -m "feat: add audio upload, presigned URL, and list endpoints"
```

---

## Task 6: JSONL Parser & API Client

**Files:**
- Create: `lib/jsonlParser.ts`
- Create: `lib/apiClient.ts`
- Create: `__tests__/lib/jsonlParser.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // lib/jsonlParser.ts
  parseDataset(content: string): DatasetRecord[]

  // lib/apiClient.ts
  apiGet<T>(path: string): Promise<T>
  apiPost<T>(path: string, formData: FormData): Promise<T>
  ```

- [ ] **Step 1: Write failing parser tests**

Create `__tests__/lib/jsonlParser.test.ts`:
```ts
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
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: `FAIL` — cannot find module `@/lib/jsonlParser`

- [ ] **Step 3: Implement parser and API client**

Create `lib/jsonlParser.ts`:
```ts
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

    return {
      id: String(record.id ?? ''),
      text: String(record.text ?? ''),
      timestamps,
      _avgConfidence,
    }
  })
}
```

Create `lib/apiClient.ts`:
```ts
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export async function apiPost<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { method: 'POST', body: formData })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail ?? `HTTP ${res.status}`)
  }
  return res.json()
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: All 5 tests `PASSED`

- [ ] **Step 5: Commit**

```bash
git add lib/ __tests__/
git commit -m "feat: add JSONL parser and API client with tests"
```

---

## Task 7: useDataset Hook

**Files:**
- Create: `hooks/useDataset.ts`

**Interfaces:**
- Consumes: `parseDataset` from `@/lib/jsonlParser`; types from `@/types`
- Produces:
  ```ts
  useDataset(): {
    records: DatasetRecord[]
    checked: Record<string, CheckedEntry>
    edited: Record<string, string>
    currentId: string | null
    loadDataset(content: string): void
    setCurrentId(id: string): void
    markChecked(id: string): void
    uncheck(id: string): void
    setEditedTranscript(id: string, text: string): void
    clearAll(): void
  }
  ```

- [ ] **Step 1: Implement useDataset**

Create `hooks/useDataset.ts`:
```ts
'use client'
import { useState, useEffect, useCallback } from 'react'
import type { DatasetRecord, CheckedEntry } from '@/types'
import { parseDataset } from '@/lib/jsonlParser'

const KEYS = {
  dataset: 'asr_dataset',
  checked: 'asr_checked',
  edited: 'asr_edited',
  currentId: 'asr_current_id',
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value))
}

export function useDataset() {
  const [records, setRecords] = useState<DatasetRecord[]>([])
  const [checked, setChecked] = useState<Record<string, CheckedEntry>>({})
  const [edited, setEdited] = useState<Record<string, string>>({})
  const [currentId, setCurrentIdState] = useState<string | null>(null)

  useEffect(() => {
    setRecords(load<DatasetRecord[]>(KEYS.dataset, []))
    setChecked(load<Record<string, CheckedEntry>>(KEYS.checked, {}))
    setEdited(load<Record<string, string>>(KEYS.edited, {}))
    setCurrentIdState(load<string | null>(KEYS.currentId, null))
  }, [])

  const loadDataset = useCallback((content: string) => {
    const parsed = parseDataset(content)
    setRecords(parsed)
    save(KEYS.dataset, parsed)
  }, [])

  const setCurrentId = useCallback((id: string) => {
    setCurrentIdState(id)
    save(KEYS.currentId, id)
  }, [])

  const markChecked = useCallback((id: string) => {
    const record = records.find((r) => r.id === id)
    const entry: CheckedEntry = {
      checked_at: new Date().toISOString(),
      original_transcript: record?.text ?? '',
    }
    setChecked((prev) => {
      const next = { ...prev, [id]: entry }
      save(KEYS.checked, next)
      return next
    })
  }, [records])

  const uncheck = useCallback((id: string) => {
    setChecked((prev) => {
      const next = { ...prev }
      delete next[id]
      save(KEYS.checked, next)
      return next
    })
  }, [])

  const setEditedTranscript = useCallback((id: string, text: string) => {
    setEdited((prev) => {
      const next = { ...prev, [id]: text }
      save(KEYS.edited, next)
      return next
    })
  }, [])

  const clearAll = useCallback(() => {
    setRecords([])
    setChecked({})
    setEdited({})
    setCurrentIdState(null)
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k))
  }, [])

  const importChecked = useCallback((entries: Array<{ id: string; checked_at: string; original_transcript: string; edited_transcript?: string }>) => {
    const newChecked: Record<string, CheckedEntry> = {}
    const newEdited: Record<string, string> = {}
    entries.forEach((e) => {
      newChecked[e.id] = { checked_at: e.checked_at, original_transcript: e.original_transcript }
      if (e.edited_transcript) newEdited[e.id] = e.edited_transcript
    })
    setChecked((prev) => {
      const merged = { ...prev, ...newChecked }
      save(KEYS.checked, merged)
      return merged
    })
    setEdited((prev) => {
      const merged = { ...prev, ...newEdited }
      save(KEYS.edited, merged)
      return merged
    })
  }, [])

  return {
    records,
    checked,
    edited,
    currentId,
    loadDataset,
    setCurrentId,
    markChecked,
    uncheck,
    setEditedTranscript,
    clearAll,
    importChecked,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add hooks/useDataset.ts
git commit -m "feat: add useDataset hook with localStorage persistence"
```

---

## Task 8: App Layout, JsonUploader & ProgressBar

**Files:**
- Create: `app/page.tsx`
- Create: `components/JsonUploader.tsx`
- Create: `components/ProgressBar.tsx`

**Interfaces:**
- Consumes: `useDataset` from `@/hooks/useDataset`
- Produces: Top-level page with 2-column layout; dataset loaded into state

- [ ] **Step 1: Create JsonUploader**

Create `components/JsonUploader.tsx`:
```tsx
'use client'
import { useRef } from 'react'

interface Props {
  onLoad: (content: string) => void
  recordCount: number
}

export default function JsonUploader({ onLoad, recordCount }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    try {
      onLoad(text)
    } catch (err) {
      alert(`Lỗi parse JSON: ${err}`)
    }
    e.target.value = ''
  }

  return (
    <div className="p-3 border border-dashed border-gray-300 rounded-lg bg-white">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Dataset JSON / JSONL
      </p>
      <button
        onClick={() => inputRef.current?.click()}
        className="w-full py-2 px-3 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition"
      >
        {recordCount > 0 ? `Đã load ${recordCount} records — Thay file` : 'Upload JSON / JSONL'}
      </button>
      <input ref={inputRef} type="file" accept=".json,.jsonl" className="hidden" onChange={handleFile} />
    </div>
  )
}
```

- [ ] **Step 2: Create ProgressBar**

Create `components/ProgressBar.tsx`:
```tsx
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
```

- [ ] **Step 3: Create app/page.tsx**

Create `app/page.tsx`:
```tsx
'use client'
import { useDataset } from '@/hooks/useDataset'
import JsonUploader from '@/components/JsonUploader'
import ProgressBar from '@/components/ProgressBar'

export default function Home() {
  const ds = useDataset()

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left panel */}
      <aside className="w-80 flex-shrink-0 flex flex-col gap-2 p-3 border-r border-gray-200 bg-gray-50 overflow-y-auto">
        <h1 className="text-base font-bold text-gray-800">ASR Labeling</h1>
        <JsonUploader onLoad={ds.loadDataset} recordCount={ds.records.length} />
        <ProgressBar total={ds.records.length} checked={Object.keys(ds.checked).length} />
        {/* AudioUploader, ItemSidebar — added in later tasks */}
        <div className="flex-1" />
      </aside>

      {/* Right panel */}
      <main className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
        {ds.records.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <p>Upload file JSON để bắt đầu</p>
          </div>
        ) : (
          <div className="text-gray-500 text-sm">
            {ds.currentId
              ? `Đang xem: ${ds.currentId}`
              : 'Chọn một item từ sidebar'}
          </div>
        )}
        {/* WaveformPlayer, TranscriptEditor — added in later tasks */}
      </main>
    </div>
  )
}
```

- [ ] **Step 4: Start dev server and verify layout**

```bash
npm run dev
```

Open `http://localhost:3000`. Expected:
- 2-column layout visible
- Upload JSON button in left panel
- After uploading sample JSON → shows "Đã load 3 records" and 0% progress bar

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx components/JsonUploader.tsx components/ProgressBar.tsx
git commit -m "feat: add 2-column layout, JSON uploader, and progress bar"
```

---

## Task 9: ItemSidebar (Virtualized)

**Files:**
- Create: `components/ItemSidebar.tsx`
- Modify: `app/page.tsx` (integrate ItemSidebar)

**Interfaces:**
- Consumes: `records: DatasetRecord[]`, `checked: Record<string, CheckedEntry>`, `currentId: string | null`, `onSelect(id: string): void`
- Produces: Virtualized list with search, filter, confidence display, highlight

- [ ] **Step 1: Create ItemSidebar**

Create `components/ItemSidebar.tsx`:
```tsx
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
          String(i).includes(q)
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
```

- [ ] **Step 2: Integrate into app/page.tsx**

Modify `app/page.tsx` — add ItemSidebar import and usage inside `<aside>` after ProgressBar:

```tsx
// Add import at top:
import ItemSidebar from '@/components/ItemSidebar'

// Replace the {/* AudioUploader, ItemSidebar comment */} with:
<div className="flex-1 min-h-0 flex flex-col">
  <ItemSidebar
    records={ds.records}
    checked={ds.checked}
    currentId={ds.currentId}
    onSelect={ds.setCurrentId}
  />
</div>
```

The full updated `app/page.tsx`:
```tsx
'use client'
import { useDataset } from '@/hooks/useDataset'
import JsonUploader from '@/components/JsonUploader'
import ProgressBar from '@/components/ProgressBar'
import ItemSidebar from '@/components/ItemSidebar'

export default function Home() {
  const ds = useDataset()

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-80 flex-shrink-0 flex flex-col gap-2 p-3 border-r border-gray-200 bg-gray-50">
        <h1 className="text-base font-bold text-gray-800">ASR Labeling</h1>
        <JsonUploader onLoad={ds.loadDataset} recordCount={ds.records.length} />
        <ProgressBar total={ds.records.length} checked={Object.keys(ds.checked).length} />
        <div className="flex-1 min-h-0 flex flex-col">
          <ItemSidebar
            records={ds.records}
            checked={ds.checked}
            currentId={ds.currentId}
            onSelect={ds.setCurrentId}
          />
        </div>
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
        {ds.records.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <p>Upload file JSON để bắt đầu</p>
          </div>
        ) : (
          <div className="text-gray-500 text-sm">
            {ds.currentId ? `Đang xem: ${ds.currentId}` : 'Chọn một item từ sidebar'}
          </div>
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 3: Verify in browser**

```bash
npm run dev
```

Upload sample JSON (3 records). Expected:
- Sidebar shows 3 items with index, ID (truncated), confidence %, transcript preview
- Clicking an item highlights it with blue left border
- Search box filters items in real time

- [ ] **Step 4: Commit**

```bash
git add components/ItemSidebar.tsx app/page.tsx
git commit -m "feat: add virtualized item sidebar with search and filter"
```

---

## Task 10: AudioUploader

**Files:**
- Create: `components/AudioUploader.tsx`
- Modify: `app/page.tsx` (add AudioUploader between ProgressBar and ItemSidebar)

**Interfaces:**
- Consumes: `apiPost` from `@/lib/apiClient`; `AudioMetadata` type
- Produces: `onUploaded(filenames: string[]): void` callback fires after successful upload

- [ ] **Step 1: Create AudioUploader**

Create `components/AudioUploader.tsx`:
```tsx
'use client'
import { useRef, useState } from 'react'
import type { AudioMetadata } from '@/types'
import { apiPost } from '@/lib/apiClient'

interface Props {
  onUploaded: (filenames: string[]) => void
}

export default function AudioUploader({ onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [lastUploaded, setLastUploaded] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      files.forEach((f) => formData.append('files', f))
      const results = await apiPost<AudioMetadata[]>('/api/upload-audio', formData)
      const names = results.map((r) => r.filename)
      setLastUploaded(names)
      onUploaded(names)
    } catch (err) {
      setError(String(err))
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div className="p-3 border border-dashed border-gray-300 rounded-lg bg-white">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Audio Files
      </p>
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="w-full py-2 px-3 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50 transition"
      >
        {uploading ? 'Đang upload...' : 'Upload Audio (.wav .mp3 .m4a .flac)'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".wav,.mp3,.m4a,.flac"
        multiple
        className="hidden"
        onChange={handleFiles}
      />
      {lastUploaded.length > 0 && (
        <p className="text-xs text-green-600 mt-1">
          ✓ Đã upload: {lastUploaded.join(', ')}
        </p>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Add to page.tsx**

Modify `app/page.tsx` to add `AudioUploader` and `onUploaded` callback. The callback triggers re-fetch of audio match for the current item (implemented in Task 11). For now, wire up `onUploaded` as a no-op prop that will be replaced when `useAudioMatch` is added.

Add this to `app/page.tsx` inside `<aside>` after ProgressBar:
```tsx
import AudioUploader from '@/components/AudioUploader'

// Inside <aside>, after <ProgressBar>:
<AudioUploader onUploaded={() => {/* retrigger audio match — wired in Task 11 */}} />
```

- [ ] **Step 3: Verify in browser**

With backend running (`uvicorn backend.main:app --port 8000 --reload`), upload a WAV file. Expected: green confirmation showing filename.

- [ ] **Step 4: Commit**

```bash
git add components/AudioUploader.tsx app/page.tsx
git commit -m "feat: add audio uploader component with backend integration"
```

---

## Task 11: useAudioMatch Hook & WaveformPlayer

**Files:**
- Create: `hooks/useAudioMatch.ts`
- Create: `components/WaveformPlayer.tsx`
- Modify: `app/page.tsx` (wire up right panel)

**Interfaces:**
- Consumes: `apiGet` from `@/lib/apiClient`; `currentId: string | null`
- Produces:
  ```ts
  useAudioMatch(currentId: string | null, retryTrigger: number): {
    audioUrl: string | null
    loading: boolean
    error: string | null
  }
  ```

- [ ] **Step 1: Create useAudioMatch hook**

Create `hooks/useAudioMatch.ts`:
```ts
'use client'
import { useState, useEffect } from 'react'
import { apiGet } from '@/lib/apiClient'

interface PresignedUrlResponse {
  url: string
  filename: string
  expires_in: number
}

export function useAudioMatch(currentId: string | null, retryTrigger: number) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!currentId) {
      setAudioUrl(null)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    apiGet<PresignedUrlResponse>(`/api/presigned-url/${encodeURIComponent(currentId)}`)
      .then((data) => {
        setAudioUrl(data.url)
      })
      .catch(() => {
        setAudioUrl(null)
        setError(`Audio chưa được upload — upload file có tên "${currentId}" để tiếp tục`)
      })
      .finally(() => setLoading(false))
  }, [currentId, retryTrigger])

  return { audioUrl, loading, error }
}
```

- [ ] **Step 2: Create WaveformPlayer**

Create `components/WaveformPlayer.tsx`:
```tsx
'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import WaveSurfer from 'wavesurfer.js'

interface Props {
  audioUrl: string | null
  loading: boolean
  error: string | null
  onTimeUpdate: (time: number) => void
  onPlayPause?: (playing: boolean) => void
}

export default function WaveformPlayer({ audioUrl, loading, error, onTimeUpdate, onPlayPause }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WaveSurfer | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [wsReady, setWsReady] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return
    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#93C5FD',
      progressColor: '#2563EB',
      height: 80,
      barWidth: 2,
      barGap: 1,
    })
    wsRef.current = ws

    ws.on('ready', () => setWsReady(true))
    ws.on('timeupdate', (t) => {
      setCurrentTime(t)
      onTimeUpdate(t)
    })
    ws.on('finish', () => { setPlaying(false); onPlayPause?.(false) })
    ws.on('decode', (d) => setDuration(d))

    return () => { ws.destroy(); wsRef.current = null }
  }, [])

  useEffect(() => {
    if (!wsRef.current || !audioUrl) { setWsReady(false); return }
    setWsReady(false)
    setPlaying(false)
    setCurrentTime(0)
    wsRef.current.load(audioUrl)
  }, [audioUrl])

  const togglePlay = useCallback(() => {
    if (!wsRef.current || !wsReady) return
    wsRef.current.playPause()
    const nowPlaying = !playing
    setPlaying(nowPlaying)
    onPlayPause?.(nowPlaying)
  }, [wsReady, playing, onPlayPause])

  const seek = useCallback((delta: number) => {
    if (!wsRef.current || !wsReady) return
    wsRef.current.skip(delta)
  }, [wsReady])

  const handleVolumeChange = useCallback((v: number) => {
    setVolume(v)
    wsRef.current?.setVolume(v)
  }, [])

  // Expose togglePlay for keyboard shortcut
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__wavesurferTogglePlay = togglePlay
  }, [togglePlay])

  function fmt(t: number) {
    const m = Math.floor(t / 60)
    const s = Math.floor(t % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  if (!audioUrl && !loading && !error) {
    return (
      <div className="flex items-center justify-center h-32 bg-gray-100 rounded-lg text-sm text-gray-400">
        Chọn một item để xem waveform
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      {loading && <div className="h-20 flex items-center justify-center text-gray-400 text-sm">Đang tải audio...</div>}
      {error && !loading && (
        <div className="h-20 flex items-center justify-center text-amber-600 text-sm bg-amber-50 rounded">
          {error}
        </div>
      )}
      <div ref={containerRef} className={loading || error ? 'hidden' : ''} />
      {!error && (
        <div className="flex items-center gap-3 mt-3">
          <button onClick={() => seek(-5)} className="text-gray-500 hover:text-gray-700 text-xs">−5s</button>
          <button
            onClick={togglePlay}
            disabled={!wsReady}
            className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-40"
          >
            {playing ? '⏸' : '▶'}
          </button>
          <button onClick={() => seek(5)} className="text-gray-500 hover:text-gray-700 text-xs">+5s</button>
          <span className="text-xs text-gray-500 tabular-nums">
            {fmt(currentTime)} / {fmt(duration)}
          </span>
          <input
            type="range"
            min={0} max={1} step={0.05}
            value={volume}
            onChange={(e) => handleVolumeChange(Number(e.target.value))}
            className="w-20 ml-auto"
          />
          <span className="text-xs text-gray-400">🔊</span>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Wire up right panel in page.tsx**

Replace `app/page.tsx` with the full integrated version:
```tsx
'use client'
import { useState, useCallback } from 'react'
import { useDataset } from '@/hooks/useDataset'
import { useAudioMatch } from '@/hooks/useAudioMatch'
import JsonUploader from '@/components/JsonUploader'
import ProgressBar from '@/components/ProgressBar'
import AudioUploader from '@/components/AudioUploader'
import ItemSidebar from '@/components/ItemSidebar'
import WaveformPlayer from '@/components/WaveformPlayer'

export default function Home() {
  const ds = useDataset()
  const [retryTrigger, setRetryTrigger] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  const { audioUrl, loading: audioLoading, error: audioError } = useAudioMatch(
    ds.currentId,
    retryTrigger
  )

  const handleUploaded = useCallback(() => {
    setRetryTrigger((t) => t + 1)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-80 flex-shrink-0 flex flex-col gap-2 p-3 border-r border-gray-200 bg-gray-50">
        <h1 className="text-base font-bold text-gray-800">ASR Labeling</h1>
        <JsonUploader onLoad={ds.loadDataset} recordCount={ds.records.length} />
        <ProgressBar total={ds.records.length} checked={Object.keys(ds.checked).length} />
        <AudioUploader onUploaded={handleUploaded} />
        <div className="flex-1 min-h-0 flex flex-col">
          <ItemSidebar
            records={ds.records}
            checked={ds.checked}
            currentId={ds.currentId}
            onSelect={ds.setCurrentId}
          />
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
        <WaveformPlayer
          audioUrl={audioUrl}
          loading={audioLoading}
          error={audioError}
          onTimeUpdate={setCurrentTime}
          onPlayPause={setIsPlaying}
        />
        {/* TranscriptEditor added in Task 12 */}
        <div className="flex-1" />
      </main>
    </div>
  )
}
```

- [ ] **Step 4: Verify in browser**

1. Upload JSON, select an item
2. Expected: audio error banner "Audio chưa được upload..."
3. Upload matching WAV file
4. Expected: waveform renders, play/pause/seek work

- [ ] **Step 5: Commit**

```bash
git add hooks/useAudioMatch.ts components/WaveformPlayer.tsx app/page.tsx
git commit -m "feat: add WaveformPlayer with presigned URL audio matching"
```

---

## Task 12: TranscriptEditor with Word Highlighting

**Files:**
- Create: `hooks/useWordHighlight.ts`
- Create: `components/TranscriptEditor.tsx`
- Modify: `app/page.tsx` (add TranscriptEditor to right panel)

**Interfaces:**
- Consumes: `DatasetRecord`, `currentTime: number`, `isPlaying: boolean`, `checked`, `edited`
- Produces: `onSave(text)`, `onCheck()`, `onUncheck()` callbacks

- [ ] **Step 1: Create useWordHighlight hook**

Create `hooks/useWordHighlight.ts`:
```ts
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
```

- [ ] **Step 2: Create TranscriptEditor**

Create `components/TranscriptEditor.tsx`:
```tsx
'use client'
import { useState, useEffect, useCallback } from 'react'
import type { DatasetRecord } from '@/types'
import { useWordHighlight } from '@/hooks/useWordHighlight'

interface Props {
  record: DatasetRecord | null
  editedText: string | undefined
  isChecked: boolean
  isPlaying: boolean
  currentTime: number
  onSave: (id: string, text: string) => void
  onCheck: (id: string) => void
  onUncheck: (id: string) => void
}

export default function TranscriptEditor({
  record,
  editedText,
  isChecked,
  isPlaying,
  currentTime,
  onSave,
  onCheck,
  onUncheck,
}: Props) {
  const displayText = editedText ?? record?.text ?? ''
  const [draft, setDraft] = useState(displayText)
  const [editMode, setEditMode] = useState(false)
  const [copied, setCopied] = useState(false)

  const activeWordIdx = useWordHighlight(record?.timestamps ?? [], currentTime)

  useEffect(() => {
    setDraft(editedText ?? record?.text ?? '')
    setEditMode(false)
  }, [record?.id])

  useEffect(() => {
    if (isPlaying) setEditMode(false)
  }, [isPlaying])

  const handleSave = useCallback(() => {
    if (!record) return
    onSave(record.id, draft)
  }, [record, draft, onSave])

  const handleCopyTranscript = useCallback(() => {
    navigator.clipboard.writeText(displayText)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [displayText])

  if (!record) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 rounded-lg text-gray-400 text-sm">
        Chọn một item để xem transcript
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-white rounded-lg border border-gray-200 p-4 gap-3 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{record.id}</span>
          {record._avgConfidence !== null && (
            <span className="ml-2 text-xs text-gray-400">
              Confidence: {Math.round(record._avgConfidence * 100)}%
            </span>
          )}
          {isChecked && <span className="ml-2 text-xs text-green-600 font-semibold">✓ Đã check</span>}
        </div>
        <button
          onClick={() => setEditMode((v) => !v)}
          className="text-xs text-blue-600 hover:underline"
        >
          {editMode ? 'Xem highlight' : 'Chỉnh sửa'}
        </button>
      </div>

      {/* Transcript area */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {!editMode ? (
          /* Play mode: word-level highlight */
          <div
            className="text-base leading-8 text-gray-800 cursor-text select-text"
            onClick={() => setEditMode(true)}
          >
            {record.timestamps.length > 0 ? (
              record.timestamps.map((t, i) => (
                <span
                  key={i}
                  className={`transition-colors duration-75 rounded px-0.5 ${
                    i === activeWordIdx
                      ? 'bg-yellow-300 text-gray-900'
                      : 'text-gray-800'
                  }`}
                >
                  {t.word}{' '}
                </span>
              ))
            ) : (
              <span>{displayText}</span>
            )}
          </div>
        ) : (
          /* Edit mode: textarea */
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full h-full min-h-[120px] resize-none text-base leading-7 text-gray-800 focus:outline-none"
            placeholder="Transcript..."
            autoFocus
          />
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        {editMode && (
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Lưu chỉnh sửa
          </button>
        )}
        {!isChecked ? (
          <button
            onClick={() => onCheck(record.id)}
            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
          >
            ✓ Mark Checked
          </button>
        ) : (
          <button
            onClick={() => onUncheck(record.id)}
            className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            Uncheck
          </button>
        )}
        <button
          onClick={handleCopyTranscript}
          className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
        >
          {copied ? 'Đã copy!' : 'Copy transcript'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire TranscriptEditor into page.tsx**

Replace `app/page.tsx`:
```tsx
'use client'
import { useState, useCallback, useMemo } from 'react'
import { useDataset } from '@/hooks/useDataset'
import { useAudioMatch } from '@/hooks/useAudioMatch'
import JsonUploader from '@/components/JsonUploader'
import ProgressBar from '@/components/ProgressBar'
import AudioUploader from '@/components/AudioUploader'
import ItemSidebar from '@/components/ItemSidebar'
import WaveformPlayer from '@/components/WaveformPlayer'
import TranscriptEditor from '@/components/TranscriptEditor'

export default function Home() {
  const ds = useDataset()
  const [retryTrigger, setRetryTrigger] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  const { audioUrl, loading: audioLoading, error: audioError } = useAudioMatch(
    ds.currentId,
    retryTrigger
  )

  const currentRecord = useMemo(
    () => ds.records.find((r) => r.id === ds.currentId) ?? null,
    [ds.records, ds.currentId]
  )

  const handleUploaded = useCallback(() => setRetryTrigger((t) => t + 1), [])

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-80 flex-shrink-0 flex flex-col gap-2 p-3 border-r border-gray-200 bg-gray-50">
        <h1 className="text-base font-bold text-gray-800">ASR Labeling</h1>
        <JsonUploader onLoad={ds.loadDataset} recordCount={ds.records.length} />
        <ProgressBar total={ds.records.length} checked={Object.keys(ds.checked).length} />
        <AudioUploader onUploaded={handleUploaded} />
        <div className="flex-1 min-h-0 flex flex-col">
          <ItemSidebar
            records={ds.records}
            checked={ds.checked}
            currentId={ds.currentId}
            onSelect={ds.setCurrentId}
          />
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
        <WaveformPlayer
          audioUrl={audioUrl}
          loading={audioLoading}
          error={audioError}
          onTimeUpdate={setCurrentTime}
          onPlayPause={setIsPlaying}
        />
        <TranscriptEditor
          record={currentRecord}
          editedText={ds.currentId ? ds.edited[ds.currentId] : undefined}
          isChecked={!!ds.currentId && !!ds.checked[ds.currentId]}
          isPlaying={isPlaying}
          currentTime={currentTime}
          onSave={ds.setEditedTranscript}
          onCheck={ds.markChecked}
          onUncheck={ds.uncheck}
        />
      </main>
    </div>
  )
}
```

- [ ] **Step 4: Verify in browser**

1. Upload JSON, upload matching audio, select item
2. Press Play → words highlight in sequence
3. Pause → click text → textarea opens for editing
4. Save edit → click "Mark Checked" → sidebar shows ✓
5. Uncheck → ✓ removed

- [ ] **Step 5: Commit**

```bash
git add hooks/useWordHighlight.ts components/TranscriptEditor.tsx app/page.tsx
git commit -m "feat: add transcript editor with word-level play highlighting"
```

---

## Task 13: Keyboard Shortcuts

**Files:**
- Create: `hooks/useKeyboard.ts`
- Modify: `app/page.tsx` (integrate useKeyboard)

**Interfaces:**
- Consumes: `records`, `currentId`, `setCurrentId`, `markChecked`; `togglePlay` from `window.__wavesurferTogglePlay`
- Produces: global `keydown` listener; `Ctrl+C` copies current item ID

- [ ] **Step 1: Create useKeyboard hook**

Create `hooks/useKeyboard.ts`:
```ts
'use client'
import { useEffect } from 'react'
import type { DatasetRecord, CheckedEntry } from '@/types'

interface Options {
  records: DatasetRecord[]
  currentId: string | null
  checked: Record<string, CheckedEntry>
  onSelect: (id: string) => void
  onCheck: (id: string) => void
}

export function useKeyboard({ records, currentId, checked, onSelect, onCheck }: Options) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA'

      // Space: play/pause (never in input)
      if (e.code === 'Space' && !inInput) {
        e.preventDefault()
        const toggle = (window as unknown as Record<string, unknown>).__wavesurferTogglePlay
        if (typeof toggle === 'function') toggle()
        return
      }

      // Ctrl+C: copy current ID
      if (e.key === 'c' && (e.ctrlKey || e.metaKey) && !inInput) {
        if (currentId) {
          e.preventDefault()
          navigator.clipboard.writeText(currentId)
        }
        return
      }

      // Ctrl+S or Enter: mark checked
      if ((e.key === 'Enter' || (e.key === 's' && (e.ctrlKey || e.metaKey))) && !inInput) {
        e.preventDefault()
        if (currentId) onCheck(currentId)
        return
      }

      // Arrow navigation (not in input)
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !inInput) {
        e.preventDefault()
        if (!records.length) return
        const idx = records.findIndex((r) => r.id === currentId)
        if (e.key === 'ArrowUp' && idx > 0) onSelect(records[idx - 1].id)
        if (e.key === 'ArrowDown' && idx < records.length - 1) onSelect(records[idx + 1].id)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [records, currentId, checked, onSelect, onCheck])
}
```

- [ ] **Step 2: Integrate into page.tsx**

Add to `app/page.tsx`:
```tsx
import { useKeyboard } from '@/hooks/useKeyboard'

// Inside Home() component, after ds and audioMatch:
useKeyboard({
  records: ds.records,
  currentId: ds.currentId,
  checked: ds.checked,
  onSelect: ds.setCurrentId,
  onCheck: ds.markChecked,
})
```

- [ ] **Step 3: Verify in browser**

1. Upload JSON, click on an item
2. `↑`/`↓` → navigates items (sidebar highlights)
3. `Space` → plays/pauses audio
4. `Enter` → marks item checked
5. `Ctrl+C` → ID copied (verify with paste into text editor)

- [ ] **Step 4: Commit**

```bash
git add hooks/useKeyboard.ts app/page.tsx
git commit -m "feat: add keyboard shortcuts (arrows, space, enter, ctrl+c)"
```

---

## Task 14: ExportPanel

**Files:**
- Create: `components/ExportPanel.tsx`
- Modify: `app/page.tsx` (add ExportPanel to right panel footer)

**Interfaces:**
- Consumes: `records`, `checked`, `edited`; `importChecked(entries): void`
- Produces: Downloads `checked_ids.json` or `full_reviewed.json`; imports from file

- [ ] **Step 1: Create ExportPanel**

Create `components/ExportPanel.tsx`:
```tsx
'use client'
import { useRef } from 'react'
import type { DatasetRecord, CheckedEntry } from '@/types'

interface Props {
  records: DatasetRecord[]
  checked: Record<string, CheckedEntry>
  edited: Record<string, string>
  onImport: (entries: Array<{
    id: string
    checked_at: string
    original_transcript: string
    edited_transcript?: string
  }>) => void
}

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function ExportPanel({ records, checked, edited, onImport }: Props) {
  const importRef = useRef<HTMLInputElement>(null)
  const checkedCount = Object.keys(checked).length

  function exportCheckedIds() {
    const data = records
      .map((r, i) => {
        const entry = checked[r.id]
        if (!entry) return null
        return {
          id: r.id,
          filename: r.id,
          index: i,
          checked_at: entry.checked_at,
          original_transcript: entry.original_transcript,
          edited_transcript: edited[r.id] ?? entry.original_transcript,
        }
      })
      .filter(Boolean)
    downloadJson(data, 'checked_ids.json')
  }

  function exportFullReviewed() {
    const data = records.map((r, i) => {
      const entry = checked[r.id]
      return {
        ...r,
        _avgConfidence: undefined,
        checked: !!entry,
        edited_transcript: edited[r.id] ?? r.text,
        checked_at: entry?.checked_at ?? null,
      }
    })
    downloadJson(data, 'full_reviewed.json')
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const entries = JSON.parse(text)
      onImport(entries)
    } catch {
      alert('Lỗi đọc file checked_ids.json')
    }
    e.target.value = ''
  }

  return (
    <div className="bg-white border-t border-gray-200 p-3 flex gap-2 flex-wrap items-center">
      <span className="text-xs text-gray-500 mr-1">{checkedCount} checked</span>
      <button
        onClick={exportCheckedIds}
        disabled={checkedCount === 0}
        className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
      >
        Export checked_ids.json
      </button>
      <button
        onClick={exportFullReviewed}
        disabled={records.length === 0}
        className="px-3 py-1.5 text-xs bg-gray-700 text-white rounded hover:bg-gray-800 disabled:opacity-40"
      >
        Export full reviewed JSON
      </button>
      <button
        onClick={() => importRef.current?.click()}
        className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
      >
        Import checked_ids.json
      </button>
      <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
    </div>
  )
}
```

- [ ] **Step 2: Add to page.tsx**

In `app/page.tsx`, add ExportPanel at the bottom of `<main>`:
```tsx
import ExportPanel from '@/components/ExportPanel'

// At the bottom of <main>, after TranscriptEditor:
<ExportPanel
  records={ds.records}
  checked={ds.checked}
  edited={ds.edited}
  onImport={ds.importChecked}
/>
```

- [ ] **Step 3: Verify in browser**

1. Check a few items
2. Click "Export checked_ids.json" → file downloads with correct structure
3. Reload page (localStorage persists)
4. Import the downloaded file → checked state restored
5. "Export full reviewed JSON" → all records with `checked` + `edited_transcript` fields

- [ ] **Step 4: Commit**

```bash
git add components/ExportPanel.tsx app/page.tsx
git commit -m "feat: add export/import panel for checked results"
```

---

## Task 15: Deployment Config & README

**Files:**
- Create: `nginx/asr-labeling.conf`
- Create: `ecosystem.config.js` (PM2)
- Create: `.env.local` from example
- Create: `README.md`

**Interfaces:**
- No code interfaces — operational config only

- [ ] **Step 1: Create Nginx config**

Create `nginx/asr-labeling.conf`:
```nginx
server {
    listen 80;
    server_name _;

    client_max_body_size 500M;

    location /api/ {
        proxy_pass http://localhost:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 300;
    }

    location /health {
        proxy_pass http://localhost:8000/health;
    }

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_http_version 1.1;
    }
}
```

- [ ] **Step 2: Create PM2 ecosystem config**

Create `ecosystem.config.js`:
```js
module.exports = {
  apps: [
    {
      name: 'asr-frontend',
      script: 'npm',
      args: 'start',
      cwd: '/home/ubuntu/asr-labeling',
      env: { PORT: 3000, NODE_ENV: 'production' },
    },
    {
      name: 'asr-backend',
      script: 'uvicorn',
      args: 'backend.main:app --host 0.0.0.0 --port 8000',
      cwd: '/home/ubuntu/asr-labeling',
      interpreter: 'python3',
    },
  ],
}
```

- [ ] **Step 3: Create README.md**

Create `README.md`:
```markdown
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
```

- [ ] **Step 4: Commit**

```bash
git add nginx/ ecosystem.config.js README.md
git commit -m "feat: add Nginx config, PM2 ecosystem, and README"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Task |
|-----------------|------|
| Upload JSON/JSONL, auto-detect fields | Task 6 (hardcoded VietMed fields) |
| Sidebar list with search + filter | Task 9 |
| Confidence display (avg of timestamps) | Task 6 + Task 9 |
| Audio upload → soundfile validate → S3 | Tasks 3, 4, 5, 10 |
| Waveform with play/pause/seek/volume | Task 11 |
| Audio matching by `id` = filename | Task 11 |
| Transcript editor (edit mode) | Task 12 |
| Word highlighting during playback | Task 12 |
| Mark checked / uncheck | Tasks 7, 12 |
| localStorage persistence | Task 7 |
| Keyboard shortcuts | Task 13 |
| Export checked_ids.json | Task 14 |
| Export full reviewed JSON | Task 14 |
| Import checked_ids.json | Task 14 |
| Ctrl+C copies ID | Task 13 |
| EC2 + Nginx deployment | Task 15 |
| README with setup + usage | Task 15 |
| Python soundfile + ffmpeg fallback | Task 4 |
| presigned URL for audio playback | Tasks 3, 5, 11 |
| Virtualized list for large datasets | Task 9 |

All requirements covered. No gaps found.

### Type consistency check

- `DatasetRecord` defined in Task 1 `types/index.ts`; used consistently in Tasks 6, 7, 9, 12
- `CheckedEntry` used in Tasks 7, 12, 14 — matches definition
- `AudioMetadata` (Python Pydantic + TS interface) — field names match across Tasks 5 and 10
- `apiGet` / `apiPost` signatures used in Tasks 8, 10 — match `apiClient.ts` from Task 6
- `useDataset` return shape used in Tasks 8–14 — all fields match Task 7 implementation
- `WaveSurfer` play/pause via `window.__wavesurferTogglePlay` bridge — set in Task 11, consumed in Task 13
