#!/usr/bin/env node

/**
 * Brief Signal — Audio script generator
 *
 * Reads the latest briefing from content/briefings/, sends it to Gemini
 * with the audio-script prompt, and saves a spoken-word script to
 * content/audio/. Optionally creates a branch and opens a PR for review.
 *
 * Usage:
 *   node scripts/generate-audio-script.js           # generate script only
 *   node scripts/generate-audio-script.js --pr      # generate + open PR
 *
 * Requires: GOOGLE_API_KEY environment variable
 */

const { GoogleGenAI } = require("@google/genai");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const BRIEFINGS_DIR = path.join(__dirname, "..", "content", "briefings");
const AUDIO_DIR = path.join(__dirname, "..", "content", "audio");
const PROMPT_PATH = path.join(__dirname, "audio-script-prompt.md");

function getLatestBriefing() {
  if (!fs.existsSync(BRIEFINGS_DIR)) {
    console.error("ERROR: No briefings directory found.");
    process.exit(1);
  }
  const files = fs
    .readdirSync(BRIEFINGS_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.error("ERROR: No briefing files found.");
    process.exit(1);
  }
  return {
    name: files[0],
    slug: files[0].replace(".md", ""),
    content: fs.readFileSync(path.join(BRIEFINGS_DIR, files[0]), "utf-8"),
  };
}

function stripCodeFences(text) {
  return text.replace(/^```(?:markdown)?\s*\n?/i, "").replace(/\n?```\s*$/, "");
}

async function main() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error("ERROR: GOOGLE_API_KEY environment variable is not set.");
    process.exit(1);
  }

  const openPR = process.argv.includes("--pr");

  // 1. Load audio script prompt
  if (!fs.existsSync(PROMPT_PATH)) {
    console.error(`ERROR: Audio script prompt not found at ${PROMPT_PATH}`);
    process.exit(1);
  }
  const systemPrompt = fs.readFileSync(PROMPT_PATH, "utf-8");

  // 2. Get latest briefing
  const briefing = getLatestBriefing();
  console.log(`Latest briefing: ${briefing.name}`);

  // 3. Check if audio script already exists
  const scriptPath = path.join(AUDIO_DIR, `${briefing.slug}-script.md`);
  if (fs.existsSync(scriptPath)) {
    console.log(`WARN: Audio script already exists at ${scriptPath}`);
    console.log("Delete it first if you want to regenerate.");
    process.exit(0);
  }

  // 4. Call Gemini
  console.log("Calling Gemini to generate audio script...");
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Convert this briefing into a spoken-word audio script:\n\n${briefing.content}`,
    config: {
      systemInstruction: systemPrompt,
    },
  });
  let script = stripCodeFences(response.text);

  // 5. Save script
  if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
  }
  fs.writeFileSync(scriptPath, script, "utf-8");

  const wordCount = script.split(/\s+/).length;
  console.log(`\nAudio script generated!`);
  console.log(`  Words: ${wordCount}`);
  console.log(`  Est. duration: ~${Math.round(wordCount / 150)} minutes`);
  console.log(`  Output: ${scriptPath}`);

  // 6. Optionally create branch and open PR
  if (openPR) {
    const branch = `audio/${briefing.slug}`;
    console.log(`\nCreating branch ${branch} and opening PR...`);

    try {
      execSync(`git checkout -b ${branch}`, { stdio: "inherit" });
      execSync(`git add ${scriptPath}`, { stdio: "inherit" });
      execSync(
        `git commit -m "Add audio script for ${briefing.slug}"`,
        { stdio: "inherit" }
      );
      execSync(`git push -u origin ${branch}`, { stdio: "inherit" });

      const prBody = [
        `## Audio Script — ${briefing.slug}`,
        "",
        `Generated from briefing: \`${briefing.name}\``,
        `Word count: ${wordCount} (~${Math.round(wordCount / 150)} min audio)`,
        "",
        "### Review checklist",
        "- [ ] Read through script for natural spoken flow",
        "- [ ] Check tone (warm colleague, not podcast host)",
        "- [ ] Verify no URLs or visual references leaked through",
        "- [ ] Edit any awkward phrasing",
        "",
        "After merging, run `npm run audio:generate` to create the MP3.",
      ].join("\n");

      execSync(
        `gh pr create --title "Audio: ${briefing.slug}" --body "${prBody.replace(/"/g, '\\"')}"`,
        { stdio: "inherit" }
      );

      execSync("git checkout main", { stdio: "inherit" });
      console.log("PR created. Returning to main.");
    } catch (err) {
      console.error("ERROR creating PR:", err.message);
      execSync("git checkout main", { stdio: "inherit" });
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err.message || err);
  process.exit(1);
});
