#!/usr/bin/env python3
"""Tests for fetch-bookmarks.py deduplication and pagination bounds.

Run: python3 scripts/fetch-bookmarks.test.py

These cover the two defects that produced the 2026-08-23 over-fetch, where a
routine weekly run returned the entire 2,472-entry bookmark archive back to
2021 instead of the ~96 genuinely new entries.
"""
import importlib.util
import json
import os
import subprocess
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



def test_imports_without_twikit():
    """This file must be importable on a machine with no twikit installed.

    `npm test` gates the GitHub Pages deploy, and this file imports
    fetch-bookmarks.py. When twikit was imported at that file's module scope it
    raised ModuleNotFoundError on the CI runner (which has no twikit), `npm
    test` exited 1, and the site stopped deploying — three consecutive failed
    deploys from 2026-08-24 to 2026-08-30, with the live site stuck on Edition
    #27 while later merges silently never shipped.

    Runs in a subprocess under an import hook that hides twikit and dotenv, so
    this asserts the real CI condition instead of trusting that this machine
    resembles it. Touches nothing needing network or credentials.
    """
    blocker = (
        "import sys\n"
        "class B:\n"
        "    def find_spec(self, name, path=None, target=None):\n"
        "        if name.split('.')[0] in ('twikit', 'dotenv'):\n"
        "            raise ImportError('No module named ' + name)\n"
        "        return None\n"
        "sys.meta_path.insert(0, B())\n"
    )
    target = Path(__file__).resolve().parent / "fetch-bookmarks.py"
    probe = (
        "import importlib.util\n"
        "spec = importlib.util.spec_from_file_location('fb', r'%s')\n"
        "m = importlib.util.module_from_spec(spec)\n"
        "spec.loader.exec_module(m)\n"
        "assert callable(m.load_existing_keys) and callable(m.should_stop_early)\n"
    ) % target
    with tempfile.TemporaryDirectory() as d:
        Path(d, "sitecustomize.py").write_text(blocker)
        r = subprocess.run([sys.executable, "-c", probe],
                           env=dict(os.environ, PYTHONPATH=d),
                           capture_output=True, text=True)
    check("module imports with twikit unavailable", r.returncode, 0)
    if r.returncode != 0 and r.stderr.strip():
        print("      " + r.stderr.strip().splitlines()[-1])



def test_x_article_urls_are_not_self_links():
    """An X Article is long-form CONTENT that happens to live on x.com.

    The domain filter treated it as a self-link, so a bookmark whose whole body
    is a t.co pointing at an article captured nothing: no external_links, no
    card_link, nothing for enrich-bookmarks.py to fetch, and a KB entry reading
    as a bare link with no caption. That is how a 25,000-word semiconductor
    analysis graded LOW on 2026-08-30.
    """
    check("i/article form", fb.is_x_article_url("https://x.com/i/article/2092862654117498880"), True)
    check("handle/article form", fb.is_x_article_url("https://x.com/fi56622380/article/209304017"), True)
    check("twitter.com host", fb.is_x_article_url("https://twitter.com/i/article/123"), True)
    # Ordinary X links must STILL be filtered out.
    check("plain status is not an article", fb.is_x_article_url("https://x.com/user/status/123"), False)
    check("profile is not an article", fb.is_x_article_url("https://x.com/user"), False)
    check("outside host is not an x article", fb.is_x_article_url("https://example.com/i/article/1"), False)


def test_extract_external_links_keeps_articles_and_drops_self_links():
    class FakeTweet:
        urls = [
            {"expanded_url": "https://x.com/i/article/2092862654117498880"},
            {"expanded_url": "https://x.com/someone/status/999"},
            {"expanded_url": "https://www.dwarkesh.com/p/openai-huggingface"},
            {"expanded_url": ""},
        ]
    links = fb.extract_external_links(FakeTweet())
    check("article link kept", "https://x.com/i/article/2092862654117498880" in links, True)
    check("plain status link dropped", "https://x.com/someone/status/999" in links, False)
    check("outside link kept", "https://www.dwarkesh.com/p/openai-huggingface" in links, True)
    check("empty url skipped", len(links), 2)


def test_blocks_to_text_joins_only_real_text():
    cs = {"blocks": [{"text": "One"}, {"text": ""}, {}, {"text": "Two"}]}
    check("blocks joined", fb.blocks_to_text(cs), "One\n\nTwo")
    check("missing content_state is empty", fb.blocks_to_text(None), "")
    check("no blocks key is empty", fb.blocks_to_text({}), "")


def test_walk_finds_content_state_at_any_depth():
    """The real payload nests it at
    /data/tweetResult/result/article/article_results/result/content_state, so
    the search must not assume a fixed path."""
    payload = {"data": {"tweetResult": {"result": {"article": {"article_results":
              {"result": {"content_state": {"blocks": [{"text": "deep"}]}}}}}}}}
    check("found when deeply nested", fb.blocks_to_text(fb._walk_for_content_state(payload)), "deep")
    check("absent returns None", fb._walk_for_content_state({"a": {"b": 1}}), None)
    check("survives lists", fb.blocks_to_text(fb._walk_for_content_state(
        {"x": [{"content_state": {"blocks": [{"text": "in-list"}]}}]})), "in-list")


print("fetch-bookmarks tests")
test_load_existing_keys_reads_every_file_shape()
test_should_stop_early()
test_threshold_is_a_run_not_a_total()
test_imports_without_twikit()
test_x_article_urls_are_not_self_links()
test_extract_external_links_keeps_articles_and_drops_self_links()
test_blocks_to_text_joins_only_real_text()
test_walk_finds_content_state_at_any_depth()

if failures:
    print(f"\n{len(failures)} failure(s): {', '.join(failures)}")
    sys.exit(1)
print("\nAll passed.")
