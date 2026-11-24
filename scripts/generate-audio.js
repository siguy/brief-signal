#!/usr/bin/env node

/**
 * Brief Signal — Audio generator (TTS)
 *
 * Reads the latest audio script from content/audio/, sends it to Gemini 3.8
 * Flash TTS on the Gemini Enterprise API (generateContent on
 * aiplatform.googleapis.com), and saves an MP3 file.
 *
 * Usage:
 *   node scripts/generate-audio.js
 *   node scripts/generate-audio.js --voice Puck
 *
 * Requires: GOOGLE_APPLICATION_CREDENTIALS pointing to a GCP service account
 *           JSON key (its project must have the Agent Platform API enabled),
 *           and ffmpeg on PATH (the API returns WAV; we encode the MP3).
 */

const { GoogleAuth } = require("google-auth-library");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const path = require("path");

const AUDIO_DIR = path.join(__dirname, "..", "content", "audio");
// 3.8 Flash TTS takes up to 8,192 input tokens per request. A full ~1,150-word
// script (7.5 KB) came back complete in one call (6:56, 46s), so a normal
// edition is ONE chunk — no seams. Longer scripts split on paragraphs.
const MAX_BYTES = Number(process.env.TTS_MAX_BYTES) || 10000;
// Finished chunks live here until the MP3 is built (scripts/logs/ is gitignored).
const CACHE_ROOT = path.join(__dirname, "logs", "tts-cache");
const CALL_TIMEOUT_MS = 180000;
const CHUNK_ATTEMPTS = 4;

const DEFAULT_VOICE = "Fenrir";
// Nov 2026: moved off gemini-2.5-pro-tts, which Google now lists as an
// "earlier" model and which timed out on ~2/3 of requests. Before swapping,
// Fenrir on 3.8 was measured against 2.5 Pro on the same script: median pitch
// 136 Hz on both (the rejected 3.1 preview sat ~40 Hz higher). 3.8 has less
// low end (24% vs 31-40% of energy below 250 Hz) and was ~2 dB quieter, which
// the loudness pass below evens out. See CHANGELOG before changing again.
const MODEL = "gemini-3.8-flash-tts";
const LOCATION = "global";
// Goes in speechMetadata.style, NOT in the text — the docs warn that
// directions written into the text may be read aloud.
const VOICE_PROMPT =
  "Read aloud like a sharp colleague casually catching you up on industry news over coffee. Warm, curious.";
// Encoding: 48 kbps mono MP3, levelled to -16 LUFS (spoken-word standard).
const MP3_BITRATE = "48k";
const LOUDNORM = "loudnorm=I=-16:TP=-1.5:LRA=11";

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
 * Returns synth(text) → WAV Buffer, calling Gemini 3.8 Flash TTS over REST.
 * Request shape per the Agent Platform TTS migration guide: transcript in
 * parts[].text, style in parts[].speechMetadata.style, voice in
 * speechConfig.voiceConfig.voice. Unary responses are a complete WAV file
 * (16-bit PCM, 24 kHz, mono) at candidates[0].content.parts[0].inlineData.
 */
async function makeSynth(voiceName) {
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const client = await auth.getClient();
  const project = await auth.getProjectId();
  const url =
    `https://aiplatform.googleapis.com/v1/projects/${project}/locations/${LOCATION}` +
    `/publishers/google/models/${MODEL}:generateContent`;

  return async function synth(text) {
    const res = await client.request({
      url,
      method: "POST",
      timeout: CALL_TIMEOUT_MS,
      data: {
        contents: [{ role: "user", parts: [{ text, speechMetadata: { style: VOICE_PROMPT } }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { voice: voiceName } },
        },
      },
    });
    const part = res.data?.candidates?.[0]?.content?.parts?.[0];
    if (!part?.inlineData?.data) {
      throw new Error(`No audio in response: ${JSON.stringify(res.data).slice(0, 200)}`);
    }
    return Buffer.from(part.inlineData.data, "base64");
  };
}

/**
 * Synthesize every chunk, reusing cached audio where it exists. Each chunk
 * gets CHUNK_ATTEMPTS attempts; the first chunk that still fails stops the
 * run, keeping everything finished so far so a re-run resumes.
 */
async function synthesizeAll(synth, chunks, { voiceName, cacheDir, log = console.log }) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const buffers = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const label = `Chunk ${i + 1}/${chunks.length}`;
    const cachePath = path.join(cacheDir, `${i}-${chunkCacheKey(chunk, voiceName)}.wav`);

    if (fs.existsSync(cachePath)) {
      log(`  ${label}: cached, reusing`);
      buffers.push(fs.readFileSync(cachePath));
      continue;
    }

    log(`  ${label}: ${Buffer.byteLength(chunk, "utf8")} bytes`);
    let audio;
    for (let attempt = 1; attempt <= CHUNK_ATTEMPTS; attempt++) {
      const started = Date.now();
      try {
        audio = await synth(chunk);
        log(`    done in ${((Date.now() - started) / 1000).toFixed(0)}s`);
        break;
      } catch (err) {
        const secs = ((Date.now() - started) / 1000).toFixed(0);
        const detail = err.response?.data ? JSON.stringify(err.response.data) : String(err.message || err);
        log(`    attempt ${attempt}/${CHUNK_ATTEMPTS} failed after ${secs}s: ${detail.slice(0, 160)}`);
        if (attempt === CHUNK_ATTEMPTS) {
          throw new Error(
            `${label} failed ${CHUNK_ATTEMPTS} times. ${i} of ${chunks.length} chunks are saved in ${cacheDir}; re-run to resume.`
          );
        }
      }
    }

    fs.writeFileSync(cachePath, audio);
    buffers.push(Buffer.from(audio));
  }
  return buffers;
}

/**
 * Pull the raw PCM samples and format out of a WAV file by walking its RIFF
 * chunks (header size varies, so never assume 44 bytes).
 */
function readWav(buf) {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("TTS response is not a WAV file");
  }
  let offset = 12;
  let format;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      format = {
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bitsPerSample: buf.readUInt16LE(body + 14),
      };
    } else if (id === "data") {
      if (!format) throw new Error("WAV data chunk before fmt chunk");
      return { ...format, pcm: buf.subarray(body, Math.min(body + size, buf.length)) };
    }
    offset = body + size + (size % 2); // chunks are word-aligned
  }
  throw new Error("WAV file has no data chunk");
}

/**
 * Join the chunks' PCM and encode one MP3 with ffmpeg (loudness-levelled).
 */
function encodeMp3(wavBuffers, mp3Path) {
  const parts = wavBuffers.map(readWav);
  const { sampleRate, channels, bitsPerSample } = parts[0];
  if (bitsPerSample !== 16) throw new Error(`Expected 16-bit PCM, got ${bitsPerSample}-bit`);
  for (const p of parts) {
    if (p.sampleRate !== sampleRate || p.channels !== channels) {
      throw new Error("Chunks came back in different audio formats; cannot join them");
    }
  }
  const rawPath = path.join(os.tmpdir(), `brief-signal-tts-${process.pid}.pcm`);
  fs.writeFileSync(rawPath, Buffer.concat(parts.map((p) => p.pcm)));
  try {
    execFileSync("ffmpeg", [
      "-loglevel", "error", "-y",
      "-f", "s16le", "-ar", String(sampleRate), "-ac", String(channels), "-i", rawPath,
      "-af", LOUDNORM, "-ac", "1", "-b:a", MP3_BITRATE, mp3Path,
    ]);
  } catch (err) {
    if (err.code === "ENOENT") throw new Error("ffmpeg not found on PATH (brew install ffmpeg)");
    throw err;
  } finally {
    fs.rmSync(rawPath, { force: true });
  }
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

  // 4. Synthesize each chunk via Gemini 3.8 Flash TTS. Finished chunks are saved
  // to a cache folder, so a retry after a failure only pays for the chunks
  // that are still missing.
  const synth = await makeSynth(voiceName);
  const cacheDir = path.join(CACHE_ROOT, script.slug);
  const audioBuffers = await synthesizeAll(synth, chunks, {
    voiceName,
    cacheDir,
  });
  // 5. Join the chunks and encode the MP3
  encodeMp3(audioBuffers, mp3Path);
  fs.rmSync(cacheDir, { recursive: true, force: true });

  const sizeMB = (fs.statSync(mp3Path).size / (1024 * 1024)).toFixed(1);
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

module.exports = { chunkText, chunkCacheKey, makeSynth, synthesizeAll, readWav, encodeMp3 };
