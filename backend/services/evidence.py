"""Private evidence validation. Never trust a filename or declared MIME alone."""
from hashlib import sha256
from io import BytesIO
from pathlib import PurePath
import warnings
import json
import subprocess
import tempfile
import shutil

from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_BYTES = 15 * 1024 * 1024
MAX_PIXELS = 12_000_000
IMAGE_TYPES = {"image/jpeg": ("JPEG", {".jpg", ".jpeg"}),
               "image/png": ("PNG", {".png"}), "image/webp": ("WEBP", {".webp"})}


def validate_image(data: bytes, mime: str, filename: str):
    if not data or len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "Images must be nonempty and at most 10 MiB")
    expected = IMAGE_TYPES.get(mime)
    if not expected or PurePath(filename.lower()).suffix not in expected[1]:
        raise HTTPException(415, "Use a JPEG, PNG or WebP image with a matching extension")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as source:
                if source.format != expected[0] or source.width * source.height > MAX_PIXELS or getattr(source, "n_frames", 1) != 1:
                    raise ValueError("Unsupported image")
                source.load()
                normalized = ImageOps.exif_transpose(source).convert("RGB")
                # Strip EXIF/GPS and all ancillary metadata by re-encoding pixels.
                clean = Image.new("RGB", normalized.size)
                clean.paste(normalized)
                output = BytesIO()
                clean.save(output, "JPEG", quality=90)
                content = output.getvalue()
                if len(content) > MAX_IMAGE_BYTES:
                    raise HTTPException(413, "Normalized image exceeds 10 MiB")
                return content, {"width": clean.width, "height": clean.height,
                    "size_bytes": len(content), "input_sha256": sha256(data).hexdigest(), "metadata_stripped": True}
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(415, "Image content is invalid or unsupported") from None


AUDIO_TYPES = {"audio/webm": ({".webm"}, {"matroska", "webm"}),
    "audio/mp4": ({".m4a", ".mp4"}, {"mov", "mp4", "m4a"}),
    "audio/x-m4a": ({".m4a"}, {"mov", "mp4", "m4a"}),
    "audio/mpeg": ({".mp3"}, {"mp3"}),
    "audio/wav": ({".wav"}, {"wav"}), "audio/x-wav": ({".wav"}, {"wav"})}


def validate_audio(data, mime, filename):
    if not data or len(data) > MAX_BYTES:
        raise HTTPException(413, "Audio must be nonempty and at most 15 MiB")
    expected = AUDIO_TYPES.get(mime)
    if not expected or PurePath(filename.lower()).suffix not in expected[0]:
        raise HTTPException(415, "Use WebM, MP4/M4A, MP3 or WAV audio with a matching extension")
    signatures = {"audio/webm": data.startswith(b"\x1a\x45\xdf\xa3"),
        "audio/mp4": data[4:8] == b"ftyp", "audio/x-m4a": data[4:8] == b"ftyp",
        "audio/mpeg": data.startswith(b"ID3") or (len(data) >= 2 and data[0] == 255 and data[1] & 224 == 224),
        "audio/wav": data[:4] == b"RIFF" and data[8:12] == b"WAVE",
        "audio/x-wav": data[:4] == b"RIFF" and data[8:12] == b"WAVE"}
    if not signatures[mime]:
        raise HTTPException(415, "Audio content does not match its declared type")
    if not shutil.which("ffprobe") or not shutil.which("ffmpeg"):
        raise HTTPException(503, "Audio processing unavailable")
    try:
        with tempfile.TemporaryDirectory(prefix="civicops-audio-") as directory:
            source = PurePath(directory) / "source"
            output = PurePath(directory) / "evidence.webm"
            with open(source, "wb") as file:
                file.write(data)
            probe = subprocess.run(["ffprobe", "-v", "error", "-protocol_whitelist", "file,pipe",
                "-show_format", "-show_streams", "-of", "json", str(source)],
                capture_output=True, timeout=15, check=True)
            details = json.loads(probe.stdout)
            streams = details.get("streams", [])
            formats = set(details.get("format", {}).get("format_name", "").split(","))
            if not formats.intersection(expected[1]) or len(streams) != 1 or streams[0].get("codec_type") != "audio":
                raise ValueError("Not a supported audio-only container")
            duration = float(details["format"]["duration"])
            if not 0 < duration <= 300:
                raise ValueError("Audio must be at most five minutes")
            # Decode the entire supported stream, strip metadata and normalize.
            subprocess.run(["ffmpeg", "-v", "error", "-xerror", "-nostdin", "-protocol_whitelist", "file,pipe",
                "-i", str(source), "-map", "0:a:0", "-map_metadata", "-1", "-vn", "-ac", "1", "-ar", "48000",
                "-c:a", "libopus", "-b:a", "64k", "-fflags", "+bitexact", "-flags:a", "+bitexact",
                str(output)], capture_output=True, timeout=30, check=True)
            with open(output, "rb") as file:
                content = file.read(MAX_BYTES + 1)
            if not content or len(content) > MAX_BYTES:
                raise ValueError("Normalized audio exceeds limit")
            return content, {"duration_seconds": duration, "size_bytes": len(content),
                "input_sha256": sha256(data).hexdigest(), "metadata_stripped": True}
    except (OSError, ValueError, KeyError, subprocess.SubprocessError):
        raise HTTPException(415, "Audio content is invalid, unsupported or longer than five minutes") from None


def validate_evidence(data, mime, filename):
    if mime in IMAGE_TYPES:
        content, metadata = validate_image(data, mime, filename)
        return content, metadata, "IMAGE", "image/jpeg", "jpg"
    if mime in AUDIO_TYPES:
        content, metadata = validate_audio(data, mime, filename)
        return content, metadata, "AUDIO", "audio/webm", "webm"
    raise HTTPException(415, "Unsupported evidence type")
