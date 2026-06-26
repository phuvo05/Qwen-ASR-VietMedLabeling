from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel
from typing import Optional
import os, json, threading

router = APIRouter()

_DATA_DIR    = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data')
_DATA_FILE   = os.path.join(_DATA_DIR, 'default_dataset.jsonl')
_CHECK_FILE  = os.path.join(_DATA_DIR, 'checked.json')
_EDITED_FILE = os.path.join(_DATA_DIR, 'edited.json')
_lock = threading.Lock()


@router.get('/api/dataset', response_class=PlainTextResponse)
async def get_dataset():
    if not os.path.exists(_DATA_FILE):
        raise HTTPException(status_code=404, detail='No default dataset')
    with open(_DATA_FILE, 'r', encoding='utf-8') as f:
        content = f.read()
    return PlainTextResponse(content, headers={'Cache-Control': 'no-store'})


class DatasetBody(BaseModel):
    content: str


@router.post('/api/dataset')
async def save_dataset(body: DatasetBody):
    os.makedirs(_DATA_DIR, exist_ok=True)
    with _lock:
        with open(_DATA_FILE, 'w', encoding='utf-8') as f:
            f.write(body.content)
        with open(_CHECK_FILE, 'w', encoding='utf-8') as f:
            json.dump({}, f)
        with open(_EDITED_FILE, 'w', encoding='utf-8') as f:
            json.dump({}, f)
    return {'status': 'ok'}


# ── Shared checked state ──────────────────────────────────────────────────────

@router.get('/api/checked')
async def get_checked():
    if not os.path.exists(_CHECK_FILE):
        return JSONResponse({}, headers={'Cache-Control': 'no-store'})
    with open(_CHECK_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return JSONResponse(data, headers={'Cache-Control': 'no-store'})


class CheckUpdate(BaseModel):
    id: str
    entry: Optional[dict] = None   # None = uncheck


@router.post('/api/checked')
async def update_checked(body: CheckUpdate):
    os.makedirs(_DATA_DIR, exist_ok=True)
    with _lock:
        data: dict = {}
        if os.path.exists(_CHECK_FILE):
            with open(_CHECK_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
        if body.entry is None:
            data.pop(body.id, None)
        else:
            data[body.id] = body.entry
        with open(_CHECK_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)
    return {'status': 'ok'}


# ── Edited transcripts ────────────────────────────────────────────────────────

@router.get('/api/edited')
async def get_edited():
    if not os.path.exists(_EDITED_FILE):
        return JSONResponse({}, headers={'Cache-Control': 'no-store'})
    with open(_EDITED_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return JSONResponse(data, headers={'Cache-Control': 'no-store'})


class EditedUpdate(BaseModel):
    id: str
    text: Optional[str] = None   # None = delete


@router.post('/api/edited')
async def update_edited(body: EditedUpdate):
    os.makedirs(_DATA_DIR, exist_ok=True)
    with _lock:
        data: dict = {}
        if os.path.exists(_EDITED_FILE):
            with open(_EDITED_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
        if body.text is None:
            data.pop(body.id, None)
        else:
            data[body.id] = body.text
        with open(_EDITED_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)
    return {'status': 'ok'}
