#!/usr/bin/env node

/**
 * Brief Signal — Audio generator (TTS)
 *
 * Reads the latest audio script from content/audio/, sends it to
 * Google Cloud Text-to-Speech (Gemini Pro TTS), and saves an MP3 file.
 *
 * Usage:
 *   node scripts/generate-audio.js
 *   node scripts/generate-audio.js --voice Puck
 *
 * Requires: GOOGLE_APPLICATION_CREDENTIALS environment variable
 *           pointing to a GCP service account JSON key.
 */

const textToSpeech = require("@google-cloud/text-to-speech");
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

const AUDIO_DIR = path.join(__dirname, "..", "content", "audio");
// Stay under the 4,000-byte API limit. Synthesis time grows with chunk size
// (Nov 2026: ~3,400 bytes took ~115s), so set TTS_MAX_BYTES lower (e.g. 2000)
// when chunks keep timing out.
const MAX_BYTES = Number(process.env.TTS_MAX_BYTES) || 3800;
// Finished chunks live here until the MP3 is built (scripts/logs/ is gitignored).
const CACHE_ROOT = path.join(__dirname, "logs", "tts-cache");
// Since Nov 2026 gemini-2.5-pro-tts (now listed by Google as an "earlier"
// model) is bimodal: a request either answers in roughly 5-75s or never
// answers at all. The client's default 60s deadline cut off slow-but-good
// answers; waiting much longer only burns time on dead requests. So: a
// moderate per-call timeout and several attempts per chunk.
const CALL_TIMEOUT_MS = 120000;
const CHUNK_ATTEMPTS = 6;

const DEFAULT_VOICE = "Fenrir";
// Stays on 2.5 Pro TTS deliberately. gemini-3.1-flash-tts-preview synthesises
// faster, but renders the SAME voice name differently — "Fenrir" on 3.1 sits
// ~40Hz higher with almost no low end, i.e. an audibly different reader.
// See CHANGELOG / FOR_SIMON.md before trying a TTS model swap again.
const MODEL = "gemini-2.5-pro-tts";
const VOICE_PROMPT =
  "Read aloud like a sharp colleague casually catching you up on industry news over coffee. Warm, curious.";

function getLatestScript() {
  if (!fs.existsSync(AUDIO_DIR)) {
    console.error("ERROR: No audio directory found. Run `npm run audio` first.");
    process.exit(1);
  }
  const scripts = fs
    .readdirSync(AUDIO_DIR)
    .filter((f) => f.endsWith("-script.md"))
    .sort()
    .reverse();

  if (scripts.length === 0) {
    console.error("ERROR: No audio script files found. Run `npm run audio` first.");
    process.exit(1);
  }
  return {
    name: scripts[0],
    slug: scripts[0].replace("-script.md", ""),
    content: fs.readFileSync(path.join(AUDIO_DIR, scripts[0]), "utf-8"),
  };
}

/**
 * Split text into chunks that fit within the TTS API byte limit.
 * Splits on paragraph breaks (double newlines) first, then on
 * sentence boundaries if paragraphs are too large.
 */
function chunkText(text, maxBytes = MAX_BYTES) {
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());

  const chunks = [];
  let current = "";

  for (const para of paragraphs) {
    const combined = current ? current + "\n\n" + para : para;
    if (Buffer.byteLength(combined, "utf8") > maxBytes) {
      if (current.trim()) chunks.push(current.trim());
      if (Buffer.byteLength(para, "utf8") > maxBytes) {
        const sentenceChunks = chunkBySentence(para, maxBytes);
        chunks.push(...sentenceChunks);
        current = "";
      } else {
        current = para;
      }
    } else {
      current = combined;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks;
}

/**
 * Split a single paragraph by sentences.
 */
function chunkBySentence(text, maxBytes) {
  const sentences = text.match(/(?:[^.!?]|\.(?=\d))+[.!?]+[\s]*/g);
  if (!sentences) return [text];

  const chunks = [];
  let current = "";

  for (const sentence of sentences) {
    const combined = current + sentence;
    if (Buffer.byteLength(combined, "utf8") > maxBytes) {
      if (current.trim()) chunks.push(current.trim());
      current = sentence;
    } else {
      current = combined;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks;
}

/**
 * Clean the script text for TTS: strip markdown formatting.
 */
function cleanForTTS(text) {
  return text.replace(/\*+([^*]+)\*+/g, "$1");
}

/**
 * Cache key for one chunk: changes whenever anything that affects the audio
 * changes (text, voice, model, style prompt), so an edited script never
 * reuses stale audio.
 */
function chunkCacheKey(chunk, voiceName) {
  return crypto
    .createHash("sha256")
    .update([MODEL, voiceName, VOICE_PROMPT, chunk].join("\n"))
    .digest("hex")
    .slice(0, 16);
}

/**
 * Synthesize every chunk, reusing cached audio where it exists. Each chunk
 * gets CALL_TIMEOUT_MS per attempt and CHUNK_ATTEMPTS attempts; the first
 * chunk that still fails stops the run, keeping everything finished so far.
 */
async function synthesizeAll(client, chunks, { voiceName, cacheDir, log = console.log }) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const buffers = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const label = `Chunk ${i + 1}/${chunks.length}`;
    const cachePath = path.join(cacheDir, `${i}-${chunkCacheKey(chunk, voiceName)}.mp3`);

    if (fs.existsSync(cachePath)) {
      log(`  ${label}: cached, reusing`);
      buffers.push(fs.readFileSync(cachePath));
      continue;
    }

    log(`  ${label}: ${Buffer.byteLength(chunk, "utf8")} bytes`);
    const request = {
      input: { text: chunk, prompt: VOICE_PROMPT },
      voice: { languageCode: "en-us", name: voiceName, modelName: MODEL },
      audioConfig: { audioEncoding: "MP3" },
    };

    let audio;
    for (let attempt = 1; attempt <= CHUNK_ATTEMPTS; attempt++) {
      const started = Date.now();
      try {
        const [response] = await client.synthesizeSpeech(request, {
          timeout: CALL_TIMEOUT_MS,
          maxRetries: 0,
        });
        audio = response.audioContent;
        log(`    done in ${((Date.now() - started) / 1000).toFixed(0)}s`);
        break;
      } catch (err) {
        const secs = ((Date.now() - started) / 1000).toFixed(0);
        log(`    attempt ${attempt}/${CHUNK_ATTEMPTS} failed after ${secs}s: ${String(err.message || err).slice(0, 120)}`);
        if (attempt === CHUNK_ATTEMPTS) {
          const done = i;
          throw new Error(
            `${label} failed ${CHUNK_ATTEMPTS} times. ${done} of ${chunks.length} chunks are saved in ${cacheDir}; re-run to resume.`
          );
        }
      }
    }

    fs.writeFileSync(cachePath, audio);
    buffers.push(Buffer.from(audio));
  }
  return buffers;
}

async function main() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error(
      "ERROR: GOOGLE_APPLICATION_CREDENTIALS environment variable is not set.\n" +
        "Set it to the path of your GCP service account JSON key."
    );
    process.exit(1);
  }

  // Parse --voice flag
  const voiceIdx = process.argv.indexOf("--voice");
  const voiceName = voiceIdx !== -1 ? process.argv[voiceIdx + 1] : DEFAULT_VOICE;

  // 1. Get latest script
  const script = getLatestScript();
  console.log(`Audio script: ${script.name}`);

  // 2. Check if MP3 already exists
  const mp3Path = path.join(AUDIO_DIR, `${script.slug}.mp3`);
  if (fs.existsSync(mp3Path)) {
    console.log(`WARN: Audio file already exists at ${mp3Path}`);
    console.log("Delete it first if you want to regenerate.");
    process.exit(0);
  }

  // 3. Clean and chunk the script
  const cleaned = cleanForTTS(script.content);
  const chunks = chunkText(cleaned);
  console.log(`Chunks: ${chunks.length}`);
  console.log(`Voice: ${voiceName} (${MODEL})`);
  console.log(`Prompt: "${VOICE_PROMPT}"`);

  // 4. Synthesize each chunk via Gemini Pro TTS. Finished chunks are saved
  // to a cache folder, so a retry after a failure only pays for the chunks
  // that are still missing.
  const client = new textToSpeech.TextToSpeechClient();
  const cacheDir = path.join(CACHE_ROOT, script.slug);
  const audioBuffers = await synthesizeAll(client, chunks, {
    voiceName,
    cacheDir,
  });
  // 5. Concatenate MP3 buffers and save
  const combined = Buffer.concat(audioBuffers);
  fs.writeFileSync(mp3Path, combined);
  fs.rmSync(cacheDir, { recursive: true, force: true });

  const sizeMB = (combined.length / (1024 * 1024)).toFixed(1);
  console.log(`\nAudio generated!`);
  console.log(`  File: ${mp3Path}`);
  console.log(`  Size: ${sizeMB} MB`);
  console.log(`  Voice: ${voiceName} (${MODEL})`);
  console.log(`\nRun \`npm run build\` to include the audio player on the site.`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal error:", err.message || err);
    process.exit(1);
  });
}

module.exports = { chunkText, chunkCacheKey, synthesizeAll };
