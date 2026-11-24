#!/usr/bin/env node

/**
 * Tests for generate-audio.js: the chunk cache, WAV parsing and MP3 encoding.
 *
 * Run: node scripts/generate-audio.test.js
 * (Plain Node assertions — no test framework dependency, no network calls.)
 *
 * The cache case that matters is the Nov 2026 outage: the TTS service answered
 * some chunks and timed out on others, and every retry threw away the finished
 * chunks and paid for them again. A retry must reuse what finished.
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { chunkCacheKey, synthesizeAll, readWav, encodeMp3 } = require("./generate-audio.js");

const quiet = () => {};

// A minimal 16-bit mono WAV, with an optional extra chunk before "data" to
// prove the parser walks chunks instead of assuming a 44-byte header.
function makeWav(samples, { sampleRate = 24000, extraChunk = false } = {}) {
  const pcm = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => pcm.writeInt16LE(v, i * 2));
  const fmt = Buffer.alloc(24);
  fmt.write("fmt ", 0, "ascii");
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(1, 8); // PCM
  fmt.writeUInt16LE(1, 10); // mono
  fmt.writeUInt32LE(sampleRate, 12);
  fmt.writeUInt32LE(sampleRate * 2, 16);
  fmt.writeUInt16LE(2, 20);
  fmt.writeUInt16LE(16, 22);
  const extra = extraChunk ? Buffer.concat([Buffer.from("LIST"), Buffer.from([3, 0, 0, 0]), Buffer.from("abc"), Buffer.from([0])]) : Buffer.alloc(0);
  const dataHdr = Buffer.alloc(8);
  dataHdr.write("data", 0, "ascii");
  dataHdr.writeUInt32LE(pcm.length, 4);
  const body = Buffer.concat([Buffer.from("WAVE"), fmt, extra, dataHdr, pcm]);
  const riff = Buffer.alloc(8);
  riff.write("RIFF", 0, "ascii");
  riff.writeUInt32LE(body.length, 4);
  return Buffer.concat([riff, body]);
}

// A fake synth: returns a WAV whose first sample encodes the call number, and
// fails the calls whose 1-based number is in failOn.
function fakeSynth(failOn = []) {
  let calls = 0;
  const synth = async (text) => {
    calls++;
    if (failOn.includes(calls)) throw new Error("DEADLINE_EXCEEDED");
    return makeWav([text.length, 0, 0]);
  };
  synth.calls = () => calls;
  return synth;
}

function hasFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function run() {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "tts-cache-test-"));
  const chunks = ["first chunk", "second chunk", "third chunk"];

  // 1. Cache key is stable and depends on the text and voice.
  assert.strictEqual(chunkCacheKey("a", "Fenrir"), chunkCacheKey("a", "Fenrir"));
  assert.notStrictEqual(chunkCacheKey("a", "Fenrir"), chunkCacheKey("b", "Fenrir"));
  assert.notStrictEqual(chunkCacheKey("a", "Fenrir"), chunkCacheKey("a", "Puck"));

  // 2. Chunk 2 fails every attempt (calls 2-5): the run stops, chunk 1 is saved.
  const first = fakeSynth([2, 3, 4, 5]);
  await assert.rejects(
    synthesizeAll(first, chunks, { voiceName: "Fenrir", cacheDir, log: quiet }),
    /Chunk 2\/3 failed 4 times\. 1 of 3 chunks are saved/
  );
  assert.strictEqual(fs.readdirSync(cacheDir).length, 1, "chunk 1 should be cached");

  // 3. Retry: chunk 1 comes from the cache, so only chunks 2 and 3 are requested.
  const second = fakeSynth();
  const buffers = await synthesizeAll(second, chunks, { voiceName: "Fenrir", cacheDir, log: quiet });
  assert.strictEqual(second.calls(), 2, "retry should only request the missing chunks");
  assert.deepStrictEqual(
    buffers.map((b) => readWav(b).pcm.readInt16LE(0)),
    chunks.map((c) => c.length),
    "audio must come back in script order"
  );

  // 4. A single failed attempt is retried without failing the run.
  const flakyDir = fs.mkdtempSync(path.join(os.tmpdir(), "tts-cache-test-"));
  const flaky = fakeSynth([1]);
  await synthesizeAll(flaky, ["only chunk"], { voiceName: "Fenrir", cacheDir: flakyDir, log: quiet });
  assert.strictEqual(flaky.calls(), 2, "one failure then one success");

  // 5. An edited chunk is not served from a stale cache entry.
  const edited = fakeSynth();
  await synthesizeAll(edited, ["first chunk EDITED", "second chunk", "third chunk"], {
    voiceName: "Fenrir",
    cacheDir,
    log: quiet,
  });
  assert.strictEqual(edited.calls(), 1, "only the edited chunk is re-requested");

  // 6. readWav walks RIFF chunks (extra LIST chunk before data) and rejects non-WAV.
  const wav = readWav(makeWav([1, -2, 3], { extraChunk: true }));
  assert.strictEqual(wav.sampleRate, 24000);
  assert.strictEqual(wav.channels, 1);
  assert.deepStrictEqual([0, 1, 2].map((i) => wav.pcm.readInt16LE(i * 2)), [1, -2, 3]);
  assert.throws(() => readWav(Buffer.from("ID3 not a wav file at all")), /not a WAV/);

  // 7. Mismatched chunk formats are refused rather than joined into garbage.
  assert.throws(
    () => encodeMp3([makeWav([0]), makeWav([0], { sampleRate: 16000 })], path.join(cacheDir, "x.mp3")),
    /different audio formats/
  );

  // 8. Two chunks encode to one valid MP3 (skipped where ffmpeg isn't installed).
  if (hasFfmpeg()) {
    const tone = Array.from({ length: 24000 }, (_, i) => Math.round(8000 * Math.sin((2 * Math.PI * 140 * i) / 24000)));
    const mp3Path = path.join(cacheDir, "out.mp3");
    encodeMp3([makeWav(tone), makeWav(tone)], mp3Path);
    const head = fs.readFileSync(mp3Path).subarray(0, 3);
    assert.ok(head.toString("ascii") === "ID3" || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0), "output should be an MP3");
  } else {
    console.log("  (skipped MP3 encode test: ffmpeg not installed)");
  }

  fs.rmSync(cacheDir, { recursive: true, force: true });
  fs.rmSync(flakyDir, { recursive: true, force: true });
  console.log("generate-audio tests: all passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
