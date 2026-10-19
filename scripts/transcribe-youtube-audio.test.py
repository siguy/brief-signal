#!/usr/bin/env python3
"""Tests for transcribe-youtube-audio.py's VTT writer.

Run: python3 scripts/transcribe-youtube-audio.test.py

The helper's output lands in the same cache extract-podcasts.js reads
(~/info-agg/extractions/<id>.en.vtt), so its format must parse there.
"""
import importlib.util
import sys
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "transcribe_youtube_audio", Path(__file__).resolve().parent / "transcribe-youtube-audio.py"
)
t = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(t)

failures = []


def check(name, actual, expected):
    if actual == expected:
        print(f"  ok   {name}")
    else:
        print(f"  FAIL {name}: expected {expected!r}, got {actual!r}")
        failures.append(name)


check("timestamp zero", t.format_timestamp(0), "00:00:00.000")
check("timestamp over an hour", t.format_timestamp(3725.3804), "01:02:05.380")
check("negative clamps to zero", t.format_timestamp(-1), "00:00:00.000")

vtt = t.segments_to_vtt([
    {"start": 0.0, "end": 5.0, "text": " War talk Friday. "},
    {"start": 5.3, "end": 6.0, "text": "   "},  # empty segments are dropped
    {"start": 6.0, "end": 7.38, "text": "Second line."},
])
check("vtt header", vtt.splitlines()[:3], ["WEBVTT", "Kind: captions", "Language: en"])
check("vtt cue", vtt.splitlines()[4:6], ["00:00:00.000 --> 00:00:05.000", "War talk Friday."])
check("empty segment dropped", vtt.count("-->"), 2)

if failures:
    print(f"\n{len(failures)} FAILED")
    sys.exit(1)
print("\nall passed")
