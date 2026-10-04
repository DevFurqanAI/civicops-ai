"""Explicit, idempotent private-bucket provisioning. Run from repository root."""
from backend.database import create_backend_client
from storage3.exceptions import StorageApiError


def prepare(client):
    try:
        bucket = client.storage.get_bucket("report-evidence")
    except StorageApiError as error:
        if str(getattr(error, "code", "")) not in {"404", "NoSuchBucket"} and str(getattr(error, "status", "")) != "404":
            raise RuntimeError("Could not inspect evidence bucket") from None
        client.storage.create_bucket("report-evidence", options={"public": False,
            "file_size_limit": 15 * 1024 * 1024, "allowed_mime_types": ["image/jpeg", "audio/webm"]})
        bucket = client.storage.get_bucket("report-evidence")
    if bucket.public:
        raise RuntimeError("Existing evidence bucket is public; make it private before proceeding")
    client.storage.update_bucket("report-evidence", options={"public": False,
        "file_size_limit": 15 * 1024 * 1024, "allowed_mime_types": ["image/jpeg", "audio/webm"]})
    print("Private evidence bucket verified")


if __name__ == "__main__":
    try:
        prepare(create_backend_client())
    except Exception as error:
        print("Storage setup failed:", type(error).__name__)
        raise SystemExit(1) from None
