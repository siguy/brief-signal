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
const path = require("path");

const AUDIO_DIR = path.join(__dirname, "..", "content", "audio");
const MAX_BYTES = 3800; // Stay safely under 4,000-byte API limit for Gemini TTS

const DEFAULT_VOICE = "Fenrir";
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

  // 4. Synthesize each chunk via Gemini Pro TTS
  const client = new textToSpeech.TextToSpeechClient();
  const audioBuffers = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const bytes = Buffer.byteLength(chunk, "utf8");
    console.log(`  Chunk ${i + 1}/${chunks.length}: ${bytes} bytes`);

    const request = {
      input: {
        text: chunk,
        prompt: VOICE_PROMPT,
      },
      voice: {
        languageCode: "en-us",
        name: voiceName,
        modelName: MODEL,
      },
      audioConfig: {
        audioEncoding: "MP3",
      },
    };

    const [response] = await client.synthesizeSpeech(request);
    audioBuffers.push(response.audioContent);
  }

  // 5. Concatenate MP3 buffers and save
  const combined = Buffer.concat(audioBuffers);
  fs.writeFileSync(mp3Path, combined);

  const sizeMB = (combined.length / (1024 * 1024)).toFixed(1);
  console.log(`\nAudio generated!`);
  console.log(`  File: ${mp3Path}`);
  console.log(`  Size: ${sizeMB} MB`);
  console.log(`  Voice: ${voiceName} (${MODEL})`);
  console.log(`\nRun \`npm run build\` to include the audio player on the site.`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message || err);
  process.exit(1);
});
