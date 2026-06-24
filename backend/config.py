from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    aws_bucket_name: str = "asr-labeling-bucket"
    aws_region: str = "ap-southeast-1"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""

    class Config:
        env_file = "backend/.env"
        extra = "ignore"

settings = Settings()
