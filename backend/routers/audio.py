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
