#!/usr/bin/env python3
"""
Brief Signal — YouTube audio → mlx-whisper → .vtt (caption fallback)

Called by extract-podcasts.js when YouTube won't give us captions for an episode.
Downloads the episode's audio with yt-dlp, transcribes it locally with mlx-whisper,
and writes a WebVTT file to the path the extractor's cache already reads
(~/info-agg/extractions/<id>.en.vtt). The next steps can't tell the difference.

Usage: python3 scripts/transcribe-youtube-audio.py <video_id> <out.vtt>
Exit code 0 = VTT written; anything else = failed (the reason is on stderr).

Settings learned from the manual recoveries (2026-09-27, 2026-10-04):
  - the audio endpoint isn't throttled the way the caption endpoint is
  - condition_on_previous_text=False, or whisper loops on "Yeah." and drops minutes
  - if yt-dlp hits "Sign in to confirm you're not a bot", retry with the
    web_embedded player client
"""
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

WHISPER_MODEL = "mlx-community/whisper-large-v3-turbo"
AUDIO_TIMEOUT_SEC = 600


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def warn(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] WARN: {msg}", file=sys.stderr, flush=True)


def format_timestamp(seconds: float) -> str:
    """WebVTT timestamp: HH:MM:SS.mmm"""
    ms = int(round(max(seconds, 0) * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def segments_to_vtt(segments: list[dict]) -> str:
    """Turn whisper segments ({start, end, text}) into a WebVTT document."""
    lines = ["WEBVTT", "Kind: captions", "Language: en", ""]
    for seg in segments:
        text = (seg.get("text") or "").strip()
        if not text:
            continue
        lines.append(f"{format_timestamp(seg['start'])} --> {format_timestamp(seg['end'])}")
        lines.append(text)
        lines.append("")
    return "\n".join(lines)


def download_audio(video_id: str, out_dir: Path) -> Path | None:
    """Download bestaudio. Retries once with the web_embedded client on failure."""
    url = f"https://www.youtube.com/watch?v={video_id}"
    attempts = [[], ["--extractor-args", "youtube:player_client=web_embedded"]]
    for extra in attempts:
        cmd = ["yt-dlp", "-f", "bestaudio", "--no-playlist", *extra,
               "-o", str(out_dir / f"{video_id}.%(ext)s"), url]
        label = "default client" if not extra else "web_embedded client"
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=AUDIO_TIMEOUT_SEC)
        except subprocess.TimeoutExpired:
            warn(f"Audio download timed out ({label}) for {video_id}")
            continue
        files = [p for p in out_dir.glob(f"{video_id}.*") if not p.name.endswith(".part")]
        if result.returncode == 0 and files:
            size_mb = files[0].stat().st_size / (1024 * 1024)
            log(f"  Audio downloaded ({label}): {size_mb:.1f} MB")
            return files[0]
        errors = [l for l in result.stderr.splitlines() if "ERROR" in l]
        warn(f"Audio download failed ({label}) for {video_id}: {errors[-1] if errors else result.stderr.strip()[-300:]}")
    return None


def main() -> int:
    if len(sys.argv) != 3:
        warn("Usage: transcribe-youtube-audio.py <video_id> <out.vtt>")
        return 2
    video_id, out_vtt = sys.argv[1], Path(sys.argv[2])
    if not re.fullmatch(r"[\w-]{11}", video_id):
        warn(f"Invalid video ID: {video_id}")
        return 2

    tmp = Path(tempfile.mkdtemp(prefix="brief-signal-yt-audio-"))
    try:
        audio = download_audio(video_id, tmp)
        if not audio:
            return 1
        log(f"  Transcribing {video_id} with mlx-whisper...")
        start = time.time()
        try:
            import mlx_whisper
            result = mlx_whisper.transcribe(
                str(audio),
                path_or_hf_repo=WHISPER_MODEL,
                condition_on_previous_text=False,
            )
        except Exception as e:
            warn(f"mlx-whisper failed for {video_id}: {e}")
            return 1
        segments = result.get("segments") or []
        if not segments:
            warn(f"mlx-whisper returned no segments for {video_id}")
            return 1
        out_vtt.parent.mkdir(parents=True, exist_ok=True)
        # Write to a temp name first so a crash never leaves a half-written cache file
        partial = out_vtt.with_suffix(".vtt.partial")
        partial.write_text(segments_to_vtt(segments), encoding="utf-8")
        partial.replace(out_vtt)
        log(f"  Whisper transcript written in {time.time() - start:.0f}s: {out_vtt} ({len(segments)} segments)")
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
