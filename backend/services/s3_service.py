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
