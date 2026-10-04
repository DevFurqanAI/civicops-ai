from io import BytesIO
from types import SimpleNamespace
from uuid import uuid4
import shutil
import wave
import pytest
from PIL import Image
from fastapi import HTTPException
from test_auth import auth_setup, headers
from test_reports import setup, payload
from backend.services.evidence import validate_image, validate_audio, MAX_IMAGE_BYTES, MAX_BYTES


def image_bytes(format="PNG"):
    buffer = BytesIO()
    Image.new("RGB", (12, 10), "red").save(buffer, format)
    return buffer.getvalue()


@pytest.fixture
def media_setup(auth_setup, monkeypatch):
    client, db, sdk = auth_setup
    objects = {}
    class Bucket:
        def upload(self, path, data, options):
            assert options == {"content-type": "image/jpeg", "upsert": "false"}
            if path in objects:
                raise ValueError("Existing object")
            objects[path] = data
        def download(self, path):
            return objects[path]
    monkeypatch.setattr(sdk.storage, "get_bucket", lambda name: SimpleNamespace(public=False))
    monkeypatch.setattr(sdk.storage, "from_", lambda name: Bucket())
    report = client.post("/api/reports", json=payload(), headers=headers()).json()
    return client, db, sdk, objects, report


def upload(client, report, data=None, token="citizen", identity=None, mime="image/png", filename="photo.png"):
    return client.post(f"/api/reports/{report['public_id']}/media", params={"upload_id": identity or str(uuid4()), "filename": filename},
        content=image_bytes() if data is None else data, headers={**headers(token), "Content-Type": mime})


def test_image_upload_metadata_access_replay_and_restart(media_setup):
    client, db, sdk, objects, report = media_setup
    identity = str(uuid4())
    result = upload(client, report, identity=identity)
    assert result.status_code == 201
    item = result.json()
    assert set(item) == {"media_id", "media_type", "mime_type", "created_at", "size_bytes"}
    assert item["media_type"] == "IMAGE" and item["mime_type"] == "image/jpeg"
    assert upload(client, report, identity=identity).json() == item
    assert len(objects) == 1
    path = f"/api/reports/{report['public_id']}/media"
    assert client.get(path, headers=headers()).json() == [item]
    content = client.get(f"{path}/{item['media_id']}", headers=headers())
    assert content.status_code == 200 and content.headers["cache-control"] == "private, no-store"
    assert content.content[:2] == b"\xff\xd8"
    from backend.repositories.incidents import IncidentsRepository
    assert IncidentsRepository(sdk).find("report_media", "id", item["media_id"])["file_hash"]
    from test_reports import DatabaseTransport
    assert len(DatabaseTransport(db.path).rows("report_media")) == 1


@pytest.mark.parametrize("token,expected", [("other",404),("operator",403),("invalid",401)])
def test_upload_relationship_authorization(media_setup,token,expected):
    client,_,_,objects,report = media_setup
    assert upload(client,report,token=token).status_code == expected
    assert not objects


def test_evidence_reads_require_owner_or_operator(media_setup):
    client,_,_,_,report = media_setup
    identity = upload(client,report).json()["media_id"]
    path=f"/api/reports/{report['public_id']}/media"
    assert client.get(path).status_code == 401
    assert client.get(path,headers=headers("other")).status_code == 404
    assert client.get(path+"/"+identity,headers=headers("other")).status_code == 404
    assert client.get(path+"/"+identity,headers=headers("operator")).status_code == 200


def test_anonymous_text_succeeds_but_cannot_claim_media(media_setup):
    client,_,_,_,_ = media_setup
    report = client.post("/api/reports",json=payload(submission_id=str(uuid4()))).json()
    assert report["public_id"]
    assert upload(client,report).status_code == 404


@pytest.mark.parametrize("data,mime,filename", [(b"<svg/>","image/png","photo.png"),
    (image_bytes(),"image/jpeg","photo.jpg"), (image_bytes(),"image/png","photo.exe"),
    (image_bytes(),"image/svg+xml","photo.svg")])
def test_invalid_image_rejected_before_storage(media_setup,data,mime,filename):
    client,_,_,objects,report = media_setup
    assert upload(client,report,data=data,mime=mime,filename=filename).status_code == 415
    assert not objects


def test_conflicting_upload_uuid_rejected(media_setup):
    client,_,_,objects,report = media_setup
    identity=str(uuid4())
    assert upload(client,report,identity=identity).status_code == 201
    assert upload(client,report,data=image_bytes("JPEG"),mime="image/jpeg",filename="photo.jpg",identity=identity).status_code == 409
    assert len(objects)==1


def test_public_bucket_fails_closed(media_setup,monkeypatch):
    client,_,sdk,objects,report=media_setup
    monkeypatch.setattr(sdk.storage,"get_bucket",lambda name: SimpleNamespace(public=True))
    assert upload(client,report).status_code==503
    assert not objects


def test_upload_concurrency_limit_is_truthful_and_releases(media_setup):
    from backend.routes.media import processing_slots
    client,_,_,objects,report=media_setup
    assert processing_slots.acquire(False) and processing_slots.acquire(False)
    try:
        response=upload(client,report)
        assert response.status_code==429 and response.headers["retry-after"]=="5" and not objects
    finally:
        processing_slots.release(); processing_slots.release()
    assert upload(client,report).status_code==201


def test_metadata_failure_can_retry_without_overwriting_object(media_setup):
    client,db,_,objects,report=media_setup
    identity=str(uuid4()); db.fail_insert_table="report_media"
    assert upload(client,report,identity=identity).status_code==503
    assert len(objects)==1
    db.fail_insert_table=None
    assert upload(client,report,identity=identity).status_code==201
    assert len(objects)==1


def test_image_limits_metadata_strip_and_pixel_limit():
    with pytest.raises(HTTPException) as error:
        validate_image(b"x"*(MAX_IMAGE_BYTES+1),"image/png","x.png")
    assert error.value.status_code==413
    buffer=BytesIO(); img=Image.new("RGB",(12,10)); exif=Image.Exif(); exif[270]="private EXIF"
    img.save(buffer,"JPEG",exif=exif)
    content,metadata=validate_image(buffer.getvalue(),"image/jpeg","x.jpg")
    assert not Image.open(BytesIO(content)).getexif() and metadata["metadata_stripped"]
    buffer=BytesIO(); Image.new("1",(4000,4000)).save(buffer,"PNG")
    with pytest.raises(HTTPException): validate_image(buffer.getvalue(),"image/png","x.png")


def test_audio_spoof_and_size_rejected():
    with pytest.raises(HTTPException) as error: validate_audio(b"#EXTM3U", "audio/mpeg", "x.mp3")
    assert error.value.status_code==415
    with pytest.raises(HTTPException) as error: validate_audio(b"x"*(MAX_BYTES+1),"audio/wav","x.wav")
    assert error.value.status_code==413


@pytest.mark.skipif(not shutil.which("ffmpeg") or not shutil.which("ffprobe"),reason="FFmpeg not installed")
def test_audio_real_decode_and_deterministic_normalization():
    buffer=BytesIO()
    with wave.open(buffer,"wb") as audio:
        audio.setnchannels(1); audio.setsampwidth(2); audio.setframerate(8000); audio.writeframes(b"\x00\x00"*8000)
    first,metadata=validate_audio(buffer.getvalue(),"audio/wav","x.wav")
    second,_=validate_audio(buffer.getvalue(),"audio/wav","x.wav")
    assert first.startswith(b"\x1a\x45\xdf\xa3") and first==second
    assert metadata["duration_seconds"]==1 and metadata["metadata_stripped"]
