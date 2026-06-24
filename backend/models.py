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
