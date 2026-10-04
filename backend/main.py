import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from backend.database import create_backend_client
from backend.config import validate_production
from fastapi.middleware.cors import CORSMiddleware

from backend.routes import reports, incidents, dashboard, auth, feedback, media

@asynccontextmanager
async def lifespan(app):
    validate_production()
    app.state.supabase = create_backend_client()
    try:
        yield
    finally:
        app.state.supabase.postgrest.aclose()


app = FastAPI(
    lifespan=lifespan,
    title="CivicOps AI Backend",
    version="1.0.0",
    description="Modular, secure incident-intelligence platform backend for frontend contract integration."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(dict.fromkeys(["http://localhost:5173", "http://127.0.0.1:5173"] + [origin.strip() for origin in os.environ.get("FRONTEND_ORIGINS", "").split(",") if origin.strip() and origin.strip() != "*"])),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
)

app.include_router(reports.router)
app.include_router(incidents.router)
app.include_router(dashboard.router)
app.include_router(auth.router)
app.include_router(feedback.router)
app.include_router(media.router)
app.include_router(media.operator_router)

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "CivicOps AI Backend"}
