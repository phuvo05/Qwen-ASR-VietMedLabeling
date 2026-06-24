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
