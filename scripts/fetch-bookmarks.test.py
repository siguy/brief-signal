#!/usr/bin/env python3
"""Tests for fetch-bookmarks.py deduplication and pagination bounds.

Run: python3 scripts/fetch-bookmarks.test.py

These cover the two defects that produced the 2026-08-23 over-fetch, where a
routine weekly run returned the entire 2,472-entry bookmark archive back to
2021 instead of the ~96 genuinely new entries.
"""
import importlib.util
import json
import sys
import tempfile
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "fetch_bookmarks", Path(__file__).resolve().parent / "fetch-bookmarks.py"
)
fb = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(fb)

failures = []


def check(name, actual, expected):
    if actual == expected:
        print(f"  ok   {name}")
    else:
        print(f"  FAIL {name}: expected {expected!r}, got {actual!r}")
        failures.append(name)


def test_load_existing_keys_reads_every_file_shape():
    """Regression: a 4-week cutoff and a strict filename pattern each silently
    dropped prior files from the dedup set, making old bookmarks look new."""
    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp)
        # Current format, recent
        (d / "bookmarks-raw-2026-08-16.json").write_text(
            json.dumps({"/a/status/1": {}, "/b/status/2": {}})
        )
        # Current format, FAR older than any window we might pick
        (d / "bookmarks-raw-2021-01-04.json").write_text(
            json.dumps({"/ancient/status/3": {}})
        )
        # Hand-written recovery variants -- filenames do not parse as a date
        (d / "bookmarks-raw-2026-08-23.full-with-dupes.json").write_text(
            json.dumps({"/rescued/status/4": {}})
        )
        (d / "bookmarks-raw-2026-07-20-window.json").write_text(
            json.dumps({"/windowed/status/5": {}})
        )
        # Legacy list-under-"bookmarks" format
        (d / "bookmarks-raw-2026-05-01.json").write_text(
            json.dumps({"extraction_date": "2026-05-01",
                        "bookmarks": [{"url": "https://x.com/old/status/6"}]})
        )
        # Unreadable file must warn, not crash
        (d / "bookmarks-raw-2026-06-01.json").write_text("{ not json")

        fb.OUTPUT_DIR = d
        keys = fb.load_existing_keys()

    check("recent entries loaded", "/a/status/1" in keys, True)
    check("pre-window entry loaded (no date cutoff)", "/ancient/status/3" in keys, True)
    check("full-with-dupes variant loaded", "/rescued/status/4" in keys, True)
    check("window variant loaded", "/windowed/status/5" in keys, True)
    check("legacy list format loaded", "/old/status/6" in keys, True)
    check("total key count", len(keys), 6)


def test_should_stop_early():
    """Pagination must end once we page into already-captured material."""
    # A page with new items never stops, and resets any running streak.
    check("new items -> continue", fb.should_stop_early(5, 0), (False, 0))
    check("new items reset streak", fb.should_stop_early(1, 2), (False, 0))

    # An unbroken run of empty pages stops at the threshold.
    stop, n = fb.should_stop_early(0, 0)
    check("1st empty page -> continue", (stop, n), (False, 1))
    stop, n = fb.should_stop_early(0, n)
    check("2nd empty page -> continue", (stop, n), (False, 2))
    stop, n = fb.should_stop_early(0, n)
    check("3rd empty page -> stop", (stop, n), (True, 3))


def test_threshold_is_a_run_not_a_total():
    """A lone duplicate page mid-stream must not end the fetch."""
    n = 0
    for page_new in (0, 0, 4, 0, 0):
        stop, n = fb.should_stop_early(page_new, n)
        assert not stop, "stopped on a broken run"
    check("interrupted run never stops", stop, False)
    check("streak resumed from zero after new page", n, 2)


print("fetch-bookmarks tests")
test_load_existing_keys_reads_every_file_shape()
test_should_stop_early()
test_threshold_is_a_run_not_a_total()

if failures:
    print(f"\n{len(failures)} failure(s): {', '.join(failures)}")
    sys.exit(1)
print("\nAll passed.")
