"""Evidence uses server-mediated access; paths and permanent URLs stay private."""
from hashlib import sha256
from uuid import UUID, NAMESPACE_URL, uuid5
import logging
from threading import BoundedSemaphore

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from starlette.concurrency import run_in_threadpool
from backend.auth import current_user, require_report_access, require_department_incident
from backend.database import get_reports_repository, get_incidents_repository
from backend.services.evidence import MAX_BYTES, validate_evidence

router = APIRouter(prefix="/api/reports", tags=["Evidence"])
operator_router = APIRouter(prefix="/api/incidents", tags=["Evidence"])
BUCKET = "report-evidence"
logger = logging.getLogger("civicops.storage")
processing_slots = BoundedSemaphore(2)


def evidence_id(report_id, upload_id):
    # Derive the server's UUID from report identity and the retry key. Never use
    # a citizen filename or a client-controlled path as the Storage object name.
    return str(uuid5(NAMESPACE_URL, f"civicops:evidence:{report_id}:{upload_id}"))


def owned_report(public_id, user, reports, upload=False):
    row = reports.by_public_id(public_id)
    if not row or not row.get("reporter_id") or row.get("archived_at"):
        raise HTTPException(404, "Report not found")
    require_report_access(row, user)
    if upload and row["reporter_id"] != user.user_id:
        raise HTTPException(403, "Only the report owner may upload evidence")
    return row


def safe_media(row):
    return {"media_id": row["id"], "media_type": row["media_type"],
            "mime_type": row["mime_type"], "created_at": row["created_at"],
            "size_bytes": row.get("metadata", {}).get("size_bytes")}


def private_bucket(client):
    try:
        if client.storage.get_bucket(BUCKET).public:
            raise ValueError("Evidence bucket must be private")
        return client.storage.from_(BUCKET)
    except Exception as error:
        logger.warning("Evidence storage failure: operation=bucket.verify exception_class=%s", type(error).__name__)
        raise HTTPException(503, "Evidence storage unavailable") from None


def persist_evidence(client, repository, report, identity, data, mime, filename):
    content, metadata, media_type, stored_mime, extension = validate_evidence(data, mime, filename)
    existing = repository.find("report_media", "id", identity)
    if existing:
        if existing["report_id"] != report["id"] or existing.get("metadata", {}).get("input_sha256") != metadata["input_sha256"]:
            raise HTTPException(409, "Evidence upload ID conflicts with an existing upload")
        return safe_media(existing)
    bucket = private_bucket(client)
    path = f"{report['id']}/{identity}.{extension}"
    digest = sha256(content).hexdigest()
    try:
        try:
            bucket.upload(path, content, {"content-type": stored_mime, "upsert": "false"})
        except Exception:
            # A retry may encounter an object written before metadata committed.
            # Never overwrite an existing object, even with the same upload UUID.
            if sha256(bucket.download(path)).hexdigest() != digest:
                raise HTTPException(409, "Evidence upload conflicts with an existing object")
        row = repository.insert_once("report_media", {"id": identity, "report_id": report["id"],
            "media_type": media_type, "storage_path": path, "mime_type": stored_mime,
            "file_hash": digest, "metadata": metadata})
        if row["report_id"] != report["id"] or row.get("file_hash") != digest:
            raise HTTPException(409, "Evidence upload ID conflicts with an existing upload")
        return safe_media(row)
    except HTTPException:
        # Keep the object on uncertain DB failure: retry can reconcile it safely.
        # Storage and PostgreSQL cannot share an atomic transaction.
        raise
    except Exception as error:
        logger.warning("Evidence storage failure: operation=evidence.upload exception_class=%s", type(error).__name__)
        raise HTTPException(503, "Evidence storage unavailable") from None


@router.post("/{public_id}/media", status_code=201)
async def upload_evidence(public_id: str, request: Request, upload_id: UUID,
                       filename: str = Query(min_length=1, max_length=200), user=Depends(current_user),
                       reports=Depends(get_reports_repository), repository=Depends(get_incidents_repository)):
    report = await run_in_threadpool(owned_report, public_id, user, reports, True)
    if not processing_slots.acquire(blocking=False):
        raise HTTPException(429, "Evidence processing busy; retry shortly", headers={"Retry-After": "5"})
    try:
        content = bytearray()
        async for chunk in request.stream():
            content.extend(chunk)
            if len(content) > MAX_BYTES:
                raise HTTPException(413, "Evidence exceeds 15 MiB")
        mime = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
        return await run_in_threadpool(persist_evidence, request.app.state.supabase, repository,
                                      report, evidence_id(report["id"], upload_id), bytes(content), mime, filename)
    finally:
        processing_slots.release()


@router.get("/{public_id}/media")
def list_media(public_id: str, user=Depends(current_user), reports=Depends(get_reports_repository),
               repository=Depends(get_incidents_repository)):
    report = owned_report(public_id, user, reports)
    return [safe_media(row) for row in repository.rows("report_media", (("eq", "report_id", report["id"]),))]


@operator_router.get("/{incident_id}/media")
def incident_media(incident_id: str, user=Depends(current_user), repository=Depends(get_incidents_repository)):
    if user.role == "DEPARTMENT":
        incident = require_department_incident(repository, incident_id, user)
    elif user.role in {"OPERATOR", "ADMIN"}:
        incident = repository.resolve(incident_id)
    else:
        raise HTTPException(403, "Operational access required")
    if not incident:
        raise HTTPException(404, "Incident not found")
    result = []
    for report in repository.linked_reports(incident["id"]):
        if report.get("reporter_id") and not report.get("archived_at"):
            for row in repository.rows("report_media", (("eq", "report_id", report["id"]),)):
                result.append({**safe_media(row), "public_id": report["public_id"]})
    return result


@router.get("/{public_id}/media/{media_id}")
def download_evidence(public_id: str, media_id: UUID, request: Request, user=Depends(current_user),
                   reports=Depends(get_reports_repository), repository=Depends(get_incidents_repository)):
    if user.role == "DEPARTMENT":
        report = reports.by_public_id(public_id)
        if not report or report.get("archived_at"):
            raise HTTPException(404, "Evidence not found")
        link = repository.link_for_report(report["id"])
        if not link:
            raise HTTPException(404, "Evidence not found")
        require_department_incident(repository, link["incident_id"], user)
    else:
        report = owned_report(public_id, user, reports)
    row = repository.find("report_media", "id", str(media_id))
    if not row or row["report_id"] != report["id"]:
        raise HTTPException(404, "Evidence not found")
    extension = {'image/jpeg': 'jpg', 'audio/webm': 'webm'}.get(row['mime_type'])
    expected_path = f"{report['id']}/{row['id']}.{extension}"
    if row["storage_path"] != expected_path or not extension:
        raise HTTPException(404, "Evidence unavailable")
    try:
        content = private_bucket(request.app.state.supabase).download(expected_path)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, "Evidence storage unavailable") from None
    return Response(content, media_type=row["mime_type"], headers={"Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff", "Content-Disposition": f'inline; filename="evidence.{extension}"'})
