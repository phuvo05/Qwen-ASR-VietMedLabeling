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

