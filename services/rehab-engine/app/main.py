"""
FastAPI wrapper — adapted from upstream's api/app.py per docs/UPSTREAM.md
§1.2 ("Extend into services/rehab-engine"). One route: session-level safety
supervision (E5).

Per docs/ARCHITECTURE.md §1 ("apps/api is the only thing that talks to
services/rehab-engine — the browser never calls the Python service
directly"), this service is not exposed publicly; only apps/api's internal
network reaches it — see docker-compose.yml, where it has no published
port. It is not yet actually called by any apps/api route: that
integration (calling /supervise before returning success from program
assignment or session start) is flagged as not wired up in docs/STATUS.md,
not silently skipped.
"""
from fastapi import FastAPI

from .models import SafetyDecision, SuperviseRequest
from .supervisor import evaluate

app = FastAPI(title="rehab-engine", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/supervise", response_model=SafetyDecision)
def supervise(request: SuperviseRequest) -> SafetyDecision:
    return evaluate(request)
