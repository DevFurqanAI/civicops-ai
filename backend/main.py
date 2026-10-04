from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routes import reports, incidents, dashboard, auth, feedback

app = FastAPI(
    title="CivicOps AI Backend",
    version="1.0.0",
    description="Modular, secure incident-intelligence platform backend for frontend contract integration."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(reports.router)
app.include_router(incidents.router)
app.include_router(dashboard.router)
app.include_router(auth.router)
app.include_router(feedback.router)

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "CivicOps AI Backend"}
