#!/usr/bin/env node

/**
 * Tests for fetch-og.js — image byte verification and source-link collection.
 *
 * Run: node fetch-og.test.js
 * (Plain Node assertions — no test framework dependency.)
 *
 * Byte literals, not captured image files. The check under test reads at most
 * 12 bytes; committing real JPEGs to git to exercise it would test nothing
 * extra and put binaries in the repo. Anything needing a real decoder (the
 * sips conversion path) is I/O and is left to the live run.
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  sniffImageFormat,
  expectedFormat,
  writeVerifiedImage,
  findImageSources,
} = require("./fetch-og.js");

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

// Real file headers, padded so nothing trips a length check.
const pad = (head) => Buffer.concat([Buffer.from(head), Buffer.alloc(64)]);
const JPEG = pad([0xff, 0xd8, 0xff, 0xe0]);
const PNG = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = Buffer.concat([
  Buffer.from("RIFF", "latin1"),
  Buffer.from([0x24, 0x00, 0x00, 0x00]), // file size field, value irrelevant
  Buffer.from("WEBP", "latin1"),
  Buffer.alloc(64),
]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

// --- sniffImageFormat -------------------------------------------------------

test("sniffImageFormat identifies JPEG", () => {
  assert.strictEqual(sniffImageFormat(JPEG), "jpeg");
});

test("sniffImageFormat identifies PNG", () => {
  assert.strictEqual(sniffImageFormat(PNG), "png");
});

test("sniffImageFormat identifies WebP", () => {
  // The format the plan's first draft missed entirely. A WebP written to a .jpg
  // path is already shipped in edition 2026-06-15 and hard-fails lint every run.
  assert.strictEqual(sniffImageFormat(WEBP), "webp");
});

test("sniffImageFormat rejects SVG markup", () => {
  // Edition #23's bug: SVG bytes served as image/jpeg, rendering broken.
  assert.strictEqual(sniffImageFormat(SVG), null);
});

test("sniffImageFormat rejects an HTML error page", () => {
  // A 200 response can still be a login wall or an error page.
  assert.strictEqual(sniffImageFormat(Buffer.from("<!DOCTYPE html><html>...")), null);
});

test("sniffImageFormat rejects a truncated buffer rather than guessing", () => {
  assert.strictEqual(sniffImageFormat(Buffer.from([0xff, 0xd8])), null);
  assert.strictEqual(sniffImageFormat(Buffer.alloc(0)), null);
});

test("sniffImageFormat does not mistake a non-WebP RIFF for WebP", () => {
  // RIFF also fronts .wav and .avi.
  const wav = Buffer.concat([
    Buffer.from("RIFF", "latin1"),
    Buffer.from([0x24, 0x00, 0x00, 0x00]),
    Buffer.from("WAVE", "latin1"),
    Buffer.alloc(64),
  ]);
  assert.strictEqual(sniffImageFormat(wav), null);
});

// --- expectedFormat ---------------------------------------------------------

test("expectedFormat maps extensions the way lint-briefing.js does", () => {
  assert.strictEqual(expectedFormat("/x/a.jpg"), "jpeg");
  assert.strictEqual(expectedFormat("/x/a.JPEG"), "jpeg");
  assert.strictEqual(expectedFormat("/x/a.png"), "png");
  assert.strictEqual(expectedFormat("/x/a.svg"), null);
});

// --- writeVerifiedImage -----------------------------------------------------

function withTmpDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fetch-og-test-"));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("writeVerifiedImage writes JPEG bytes to a .jpg path", () => {
  withTmpDir((dir) => {
    const dest = path.join(dir, "story.jpg");
    assert.strictEqual(writeVerifiedImage(JPEG, dest), true);
    assert.strictEqual(sniffImageFormat(fs.readFileSync(dest)), "jpeg");
  });
});

test("writeVerifiedImage refuses SVG markup and writes nothing", () => {
  withTmpDir((dir) => {
    const dest = path.join(dir, "story.jpg");
    assert.strictEqual(writeVerifiedImage(SVG, dest), false);
    assert.ok(!fs.existsSync(dest), "a rejected download must leave no file behind");
  });
});

test("writeVerifiedImage never leaves bytes that disagree with the extension", () => {
  // The whole point: whatever the outcome, a file that EXISTS must match its
  // extension — that is exactly what lint-briefing.js checks later. On macOS
  // sips converts; elsewhere the write is refused. Both are correct.
  withTmpDir((dir) => {
    for (const [name, buf] of [["a.jpg", PNG], ["b.jpg", WEBP], ["c.png", JPEG]]) {
      const dest = path.join(dir, name);
      const ok = writeVerifiedImage(buf, dest);
      assert.strictEqual(ok, fs.existsSync(dest), "return value must match whether a file was written");
      if (ok) {
        assert.strictEqual(
          sniffImageFormat(fs.readFileSync(dest)),
          expectedFormat(dest),
          `${name}: written bytes must match the extension`
        );
      }
    }
  });
});

// --- findImageSources -------------------------------------------------------

test("findImageSources collects every nearby URL, not just the first", () => {
  // The regression: this used to break on the first URL. A story linking a
  // non-YouTube source first could never reach the YouTube thumbnail fallback.
  const md = [
    "![Compute architecture](./images/compute.jpg)",
    "",
    "Some prose about the story.",
    "",
    "Source: [OpenAI](https://openai.com/news/thing)",
    "Also: [the episode](https://www.youtube.com/watch?v=abc123XYZ)",
  ].join("\n");

  const [img] = findImageSources(md);
  assert.strictEqual(img.sourceUrl, "https://openai.com/news/thing", "primary source stays first");
  assert.strictEqual(img.sourceUrls.length, 2);
  assert.ok(
    img.sourceUrls.some((u) => u.includes("youtube.com")),
    "the YouTube link must survive for the thumbnail fallback"
  );
});

test("findImageSources ignores links beyond the nearby window", () => {
  const md = [
    "![Story](./images/story.jpg)",
    ...Array(15).fill(""),
    "[far away](https://example.com/too-far)",
  ].join("\n");
  assert.strictEqual(findImageSources(md).length, 0);
});

test("findImageSources returns nothing when an image has no nearby link", () => {
  assert.strictEqual(findImageSources("![Story](./images/story.jpg)\n\nprose only\n").length, 0);
});

if (failed > 0) {
  console.error(`\n${failed} test(s) FAILED, ${passed} passed.`);
} else {
  console.log(`\nAll ${passed} tests passed.`);
}
