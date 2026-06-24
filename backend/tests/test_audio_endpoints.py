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
