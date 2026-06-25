from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
import os

router = APIRouter()

_DATA_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'default_dataset.jsonl')


@router.get('/api/dataset', response_class=PlainTextResponse)
async def get_dataset():
    if not os.path.exists(_DATA_FILE):
        raise HTTPException(status_code=404, detail='No default dataset')
    with open(_DATA_FILE, 'r', encoding='utf-8') as f:
        return f.read()


class DatasetBody(BaseModel):
    content: str


@router.post('/api/dataset')
async def save_dataset(body: DatasetBody):
    os.makedirs(os.path.dirname(_DATA_FILE), exist_ok=True)
    with open(_DATA_FILE, 'w', encoding='utf-8') as f:
        f.write(body.content)
    return {'status': 'ok'}
