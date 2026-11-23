#!/usr/bin/env node

/**
 * Tests for the TTS chunk cache in generate-audio.js.
 *
 * Run: node scripts/generate-audio.test.js
 * (Plain Node assertions — no test framework dependency, no network calls.)
 *
 * The case that matters is the Nov 2026 outage: Google's TTS answered some
 * chunks and timed out on others, and every retry threw away the finished
 * chunks and paid for them again. A retry must now reuse what finished.
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chunkCacheKey, synthesizeAll } = require("./generate-audio.js");

const quiet = () => {};

// A fake client: returns "audio-N" for each call, and fails the calls whose
// 1-based number is in failOn.
function fakeClient(failOn = []) {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    async synthesizeSpeech(request) {
      calls++;
      if (failOn.includes(calls)) throw new Error("4 DEADLINE_EXCEEDED");
      return [{ audioContent: Buffer.from(`audio:${request.input.text}`) }];
    },
  };
}

async function run() {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "tts-cache-test-"));
  const chunks = ["first chunk", "second chunk", "third chunk"];

  // 1. Cache key is stable and depends on the text and voice.
  assert.strictEqual(chunkCacheKey("a", "Fenrir"), chunkCacheKey("a", "Fenrir"));
  assert.notStrictEqual(chunkCacheKey("a", "Fenrir"), chunkCacheKey("b", "Fenrir"));
  assert.notStrictEqual(chunkCacheKey("a", "Fenrir"), chunkCacheKey("a", "Puck"));

  // 2. Chunk 2 fails every attempt (calls 2-7): the run stops, chunk 1 is saved.
  const first = fakeClient([2, 3, 4, 5, 6, 7]);
  await assert.rejects(
    synthesizeAll(first, chunks, { voiceName: "Fenrir", cacheDir, log: quiet }),
    /Chunk 2\/3 failed 6 times\. 1 of 3 chunks are saved/
  );
  assert.strictEqual(fs.readdirSync(cacheDir).length, 1, "chunk 1 should be cached");

  // 3. Retry: chunk 1 comes from the cache, so only chunks 2 and 3 are requested.
  const second = fakeClient();
  const buffers = await synthesizeAll(second, chunks, { voiceName: "Fenrir", cacheDir, log: quiet });
  assert.strictEqual(second.calls, 2, "retry should only request the missing chunks");
  assert.deepStrictEqual(
    buffers.map((b) => b.toString()),
    chunks.map((c) => `audio:${c}`),
    "audio must come back in script order"
  );

  // 4. A single failed attempt is retried without failing the run.
  const flakyDir = fs.mkdtempSync(path.join(os.tmpdir(), "tts-cache-test-"));
  const flaky = fakeClient([1]);
  await synthesizeAll(flaky, ["only chunk"], { voiceName: "Fenrir", cacheDir: flakyDir, log: quiet });
  assert.strictEqual(flaky.calls, 2, "one failure then one success");

  // 5. An edited chunk is not served from a stale cache entry.
  const edited = fakeClient();
  await synthesizeAll(edited, ["first chunk EDITED", "second chunk", "third chunk"], {
    voiceName: "Fenrir",
    cacheDir,
    log: quiet,
  });
  assert.strictEqual(edited.calls, 1, "only the edited chunk is re-requested");

  fs.rmSync(cacheDir, { recursive: true, force: true });
  fs.rmSync(flakyDir, { recursive: true, force: true });
  console.log("generate-audio tests: all passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
