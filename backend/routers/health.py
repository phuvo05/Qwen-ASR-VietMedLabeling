from fastapi import APIRouter
from backend.models import HealthResponse

router = APIRouter()

@router.get("/health", response_model=HealthResponse)
def health():
    return HealthResponse(status="ok")
