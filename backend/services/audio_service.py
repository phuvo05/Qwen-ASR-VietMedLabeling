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
