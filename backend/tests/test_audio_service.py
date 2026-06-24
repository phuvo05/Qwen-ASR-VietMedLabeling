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
