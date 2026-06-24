from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.routers import health

app = FastAPI(title="ASR Labeling Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
