#!/usr/bin/env node

/**
 * Tests for caption download + whisper fallback in extract-podcasts.js.
 *
 * Run: node scripts/extract-podcasts.test.js
 * (Plain Node assertions — no test framework, no network. yt-dlp and the
 * whisper helper are replaced by fake runners that write files like they would.)
 *
 * Background: from 2026-09-27, about half of YouTube podcast episodes failed
 * with "No subtitles" every week. Asking yt-dlp for "en" picked a machine-
 * translated caption track (Ukrainian dub -> English), which YouTube 429s.
 * The original English track "en-orig" downloads fine.
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  captionAttempts,
  lastYtDlpError,
  downloadCaptions,
  fetchUploadDate,
  downloadAllSubtitles,
  transcribeWithWhisper,
  coverageReport,
  parseVtt,
  writeOutputs,
} = require("./extract-podcasts.js");

const ID = "L4SWQebqhek";
const VTT = "WEBVTT\nKind: captions\nLanguage: en\n\n00:00:00.000 --> 00:00:02.110\nhello there\n";
// What yt-dlp actually printed on 2026-10-19 for a translated track (trimmed)
const STDERR_429 = [
  "Traceback (most recent call last):",
  '  File "/opt/homebrew/lib/python3.11/site-packages/yt_dlp/YoutubeDL.py", line 4501, in _write_subtitles',
  "yt_dlp.utils.DownloadError: Unable to download video subtitles for 'en': HTTP Error 429: Too Many Requests",
  "ERROR: Unable to download video subtitles for 'en': HTTP Error 429: Too Many Requests",
  "",
].join("\n");

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    console.log(`  FAIL ${name}\n       ${err.message}`);
    process.exitCode = 1;
  }
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "extract-podcasts-test-"));
}

// Fake yt-dlp: `plan` maps a --sub-langs value to "ok" (writes the file the
// real yt-dlp would) or an error string (returned as stderr).
function fakeYtDlp(plan, calls = []) {
  return async (args) => {
    calls.push(args);
    const langIdx = args.indexOf("--sub-langs");
    const outPath = args[args.indexOf("-o") + 1];
    const lang = langIdx >= 0 ? args[langIdx + 1] : null;
    const result = plan[lang];
    if (result === "ok") {
      fs.writeFileSync(`${outPath}.${lang}.vtt`, VTT);
      return { ok: true, stdout: "", stderr: "" };
    }
    if (result === "none") return { ok: true, stdout: "", stderr: "" }; // no such track
    return { ok: false, stdout: "", stderr: result || "ERROR: unexpected call" };
  };
}

(async () => {
  console.log("extract-podcasts.js — captions + whisper fallback");

  await test("asks for en-orig first and never for translated auto 'en'", () => {
    const attempts = captionAttempts("/x/ID");
    assert.deepStrictEqual(attempts[0].args, ["--write-auto-subs", "--sub-langs", "en-orig"]);
    for (const a of attempts) {
      const isAutoEn = a.args.includes("--write-auto-subs") && a.args[a.args.indexOf("--sub-langs") + 1] === "en";
      assert.ok(!isAutoEn, `attempt "${a.label}" requests auto 'en', which can be a translated track`);
    }
  });

  await test("lastYtDlpError pulls the ERROR line out of a traceback", () => {
    assert.strictEqual(lastYtDlpError(STDERR_429), "ERROR: Unable to download video subtitles for 'en': HTTP Error 429: Too Many Requests");
    assert.strictEqual(lastYtDlpError("just some text\nfinal line"), "final line");
    assert.strictEqual(lastYtDlpError(""), "no error output");
  });

  await test("en-orig success is saved under the cache name <id>.en.vtt", async () => {
    const dir = tmpDir();
    const calls = [];
    const r = await downloadCaptions(ID, { dir, run: fakeYtDlp({ "en-orig": "ok" }, calls) });
    assert.strictEqual(r.vttPath, path.join(dir, `${ID}.en.vtt`));
    assert.strictEqual(r.source, "auto en-orig");
    assert.ok(fs.existsSync(r.vttPath));
    assert.ok(!fs.existsSync(path.join(dir, `${ID}.en-orig.vtt`)), "en-orig file should be renamed");
    assert.strictEqual(calls.length, 1, "one request when en-orig works");
  });

  await test("falls back to manual en subs when en-orig fails, and records the error", async () => {
    const dir = tmpDir();
    const r = await downloadCaptions(ID, { dir, run: fakeYtDlp({ "en-orig": STDERR_429, en: "ok" }) });
    assert.strictEqual(r.source, "manual en");
    assert.ok(fs.existsSync(r.vttPath));
    assert.match(r.errors[0], /auto en-orig: ERROR: .*429/);
  });

  await test("all caption attempts failing returns null with every yt-dlp error", async () => {
    const dir = tmpDir();
    const r = await downloadCaptions(ID, { dir, run: fakeYtDlp({ "en-orig": STDERR_429, en: "none" }) });
    assert.strictEqual(r.vttPath, null);
    assert.strictEqual(r.errors.length, 2);
    assert.match(r.errors[0], /429/);
    assert.strictEqual(r.errors[1], "manual en: no such track");
  });

  await test("a cached .en.vtt (e.g. from whisper) skips YouTube entirely", async () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, `${ID}.en.vtt`), VTT);
    const calls = [];
    const r = await downloadCaptions(ID, { dir, run: fakeYtDlp({}, calls) });
    assert.strictEqual(r.source, "cache");
    assert.strictEqual(calls.length, 0);
  });

  await test("fetchUploadDate caches the date and reuses it", async () => {
    const dir = tmpDir();
    let n = 0;
    const run = async () => { n++; return { ok: true, stdout: "20261015\n", stderr: "" }; };
    assert.strictEqual(await fetchUploadDate(ID, { dir, run }), "20261015");
    assert.strictEqual(await fetchUploadDate(ID, { dir, run }), "20261015");
    assert.strictEqual(n, 1);
  });

  await test("out-of-window episodes get no caption request", async () => {
    const dir = tmpDir();
    const calls = [];
    const run = async (args) => {
      calls.push(args);
      if (args.includes("--print")) {
        const id = args[args.length - 1].split("v=")[1];
        return { ok: true, stdout: id === "oldoldoldol" ? "20260901\n" : "20261015\n", stderr: "" };
      }
      return fakeYtDlp({ "en-orig": "ok" })(args);
    };
    const eps = [
      { podcast: { name: "A" }, episode: { video_id: "oldoldoldol", title: "old" } },
      { podcast: { name: "B" }, episode: { video_id: "newnewnewne", title: "new" } },
    ];
    const { subtitles, dates } = await downloadAllSubtitles(eps, 4, { dateAfter: "20261011", dir, run });
    assert.strictEqual(subtitles.get("oldoldoldol"), null);
    assert.ok(subtitles.get("newnewnewne"));
    assert.strictEqual(dates.get("oldoldoldol"), "20260901");
    const captionCalls = calls.filter((a) => a.includes("--sub-langs"));
    assert.strictEqual(captionCalls.length, 1, "only the in-window episode asks for captions");
  });

  await test("whisper fallback returns the VTT path the helper wrote", async () => {
    const dir = tmpDir();
    const run = async (id, vttFile) => { fs.writeFileSync(vttFile, VTT); return { ok: true, stdout: "[00:00:00]   done\n", stderr: "" }; };
    const p = await transcribeWithWhisper(ID, { dir, run });
    assert.strictEqual(p, path.join(dir, `${ID}.en.vtt`));
    assert.ok(parseVtt(p).includes("hello there"));
  });

  await test("whisper fallback failure returns null (and doesn't throw)", async () => {
    const dir = tmpDir();
    const run = async () => ({ ok: false, stdout: "", stderr: "WARN: Audio download failed\nERROR: Sign in to confirm you're not a bot" });
    assert.strictEqual(await transcribeWithWhisper(ID, { dir, run }), null);
  });

  await test("coverage: healthy week does not warn", () => {
    const r = coverageReport({ inWindow: 40, captions: 38, whisper: 2 });
    assert.strictEqual(r.warn, false);
    assert.match(r.lines[0], /40\/40 .*captions 38, whisper fallback 2, missing 0/);
  });

  await test("coverage: last week's numbers (24 of ~45 missing) warn loudly", () => {
    const r = coverageReport({ inWindow: 45, captions: 21, whisper: 0 });
    assert.strictEqual(r.warn, true);
    assert.ok(r.lines.some((l) => /CAPTION SUCCESS RATE LOW: 21\/45/.test(l)));
    assert.ok(r.lines.some((l) => /24 in-window episode\(s\) have NO transcript/.test(l)));
  });

  await test("coverage: whisper rescue still flags the broken caption path", () => {
    const r = coverageReport({ inWindow: 45, captions: 21, whisper: 24 });
    assert.strictEqual(r.warn, true);
    assert.ok(r.lines.some((l) => /CAPTION SUCCESS RATE LOW/.test(l)));
    assert.ok(!r.lines.some((l) => /NO transcript/.test(l)));
  });

  await test("coverage: zero in-window episodes is not an error", () => {
    assert.strictEqual(coverageReport({ inWindow: 0, captions: 0, whisper: 0 }).warn, false);
  });

  await test("parseVtt reads whisper-style VTT (no word-timing tags)", () => {
    const dir = tmpDir();
    const p = path.join(dir, "w.en.vtt");
    fs.writeFileSync(p, "WEBVTT\nKind: captions\nLanguage: en\n\n00:00:00.000 --> 00:00:05.000\nWar talk Friday.\n\n01:02:05.300 --> 01:02:07.380\nSecond line.\n");
    assert.strictEqual(parseVtt(p), "War talk Friday. Second line.");
  });

  // --- writeOutputs: same-day runs merge, never overwrite (2026-10-25 incident) ---
  const ep = (id, rating = "MEDIUM") => ({
    video_id: id, podcast_name: "Latent Space", episode_title: `Episode ${id}`,
    date: "2026-10-22", url: `https://www.youtube.com/watch?v=${id}`, duration_min: 60,
    signal_rating: rating, notable_quotes: [], consensus_signals: [], debate_points: [],
    intent_signals: [], gcp_intelligence: null, companies_mentioned: [], topics: [],
  });
  const outDirs = () => { const d = tmpDir(); return { rawDir: path.join(d, "raw"), skillsDir: path.join(d, "skills") }; };
  const readRaw = (dirs) => JSON.parse(fs.readFileSync(path.join(dirs.rawDir, "podcasts-raw-2026-10-25.json"), "utf-8"));
  const readKb = (dirs) => fs.readFileSync(path.join(dirs.skillsDir, "podcasts-knowledge-base-2026-10-25.md"), "utf-8");

  await test("writeOutputs: a later run that finds nothing keeps the earlier run's episodes", () => {
    const dirs = outDirs();
    writeOutputs({ extractions: [ep("AAA", "HIGH"), ep("BBB")], deepDives: {}, today: "2026-10-25", ...dirs });
    writeOutputs({ extractions: [], deepDives: {}, today: "2026-10-25", ...dirs });
    assert.deepStrictEqual(readRaw(dirs).map((e) => e.video_id), ["AAA", "BBB"]);
    assert.ok(readKb(dirs).includes("Episode AAA") && readKb(dirs).includes("Episode BBB"));
  });

  await test("writeOutputs: keeps RSS entries already in the shared files", () => {
    const dirs = outDirs();
    fs.mkdirSync(dirs.rawDir, { recursive: true });
    fs.mkdirSync(dirs.skillsDir, { recursive: true });
    fs.writeFileSync(path.join(dirs.rawDir, "podcasts-raw-2026-10-25.json"),
      JSON.stringify([{ id: "1", video_id: null, podcast_name: "AI Daily Brief", episode_title: "RSS one" }]));
    fs.writeFileSync(path.join(dirs.skillsDir, "podcasts-knowledge-base-2026-10-25.md"), "# header\n\n## AI Daily Brief — RSS one\n");
    writeOutputs({ extractions: [ep("AAA")], deepDives: {}, today: "2026-10-25", ...dirs });
    const raw = readRaw(dirs);
    assert.deepStrictEqual(raw.map((e) => e.episode_title), ["RSS one", "Episode AAA"]);
    assert.deepStrictEqual(raw.map((e) => e.id), ["1", "2"]);
    assert.ok(readKb(dirs).includes("RSS one") && readKb(dirs).includes("Episode AAA"));
  });

  await test("writeOutputs: re-extracting an episode replaces its raw entry, no duplicate", () => {
    const dirs = outDirs();
    writeOutputs({ extractions: [ep("AAA", "LOW")], deepDives: {}, today: "2026-10-25", ...dirs });
    writeOutputs({ extractions: [ep("AAA", "HIGH")], deepDives: {}, today: "2026-10-25", ...dirs });
    const raw = readRaw(dirs);
    assert.strictEqual(raw.length, 1);
    assert.strictEqual(raw[0].signal_rating, "HIGH");
  });

  await test("writeOutputs: appending to an empty-marked KB drops the EMPTY marker", () => {
    const dirs = outDirs();
    writeOutputs({ extractions: [], deepDives: {}, today: "2026-10-25", ...dirs });
    assert.ok(readKb(dirs).includes("EMPTY"));
    writeOutputs({ extractions: [ep("AAA")], deepDives: {}, today: "2026-10-25", ...dirs });
    assert.ok(!readKb(dirs).includes("EMPTY") && readKb(dirs).includes("Episode AAA"));
  });

  console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
})();
