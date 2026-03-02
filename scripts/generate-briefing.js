#!/usr/bin/env node

/**
 * Brief Signal — Gemini-powered briefing generator
 *
 * Reads knowledge base files from ~/skills/, loads the system prompt from
 * scripts/briefing-prompt.md, and calls Gemini to generate a weekly briefing.
 *
 * Requires: GOOGLE_API_KEY environment variable
 */

const { GoogleGenAI } = require("@google/genai");
const fs = require("fs");
const path = require("path");

const SKILLS_DIR = path.join(process.env.HOME, "skills");
const BRIEFINGS_DIR = path.join(__dirname, "..", "content", "briefings");
const PROMPT_PATH = path.join(__dirname, "briefing-prompt.md");
const MAX_AGE_DAYS = 14;

function findKnowledgeBaseFiles() {
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const files = fs.readdirSync(SKILLS_DIR).filter((f) => {
    const match =
      f.startsWith("bookmarks-knowledge-base-") ||
      f.startsWith("playlist-knowledge-base-");
    if (!match) return false;
    const stat = fs.statSync(path.join(SKILLS_DIR, f));
    return stat.mtimeMs >= cutoff;
  });

  // Sort by modification time descending (newest first)
  files.sort((a, b) => {
    const sa = fs.statSync(path.join(SKILLS_DIR, a));
    const sb = fs.statSync(path.join(SKILLS_DIR, b));
    return sb.mtimeMs - sa.mtimeMs;
  });

  // Take the most recent of each type
  const bookmarks = files.find((f) =>
    f.startsWith("bookmarks-knowledge-base-")
  );
  const playlist = files.find((f) =>
    f.startsWith("playlist-knowledge-base-")
  );

  const selected = [];
  if (bookmarks) selected.push(bookmarks);
  if (playlist) selected.push(playlist);
  return selected;
}

function getLatestBriefing() {
  if (!fs.existsSync(BRIEFINGS_DIR)) return null;
  const files = fs
    .readdirSync(BRIEFINGS_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
    .reverse();
  if (files.length === 0) return null;
  return {
    name: files[0],
    content: fs.readFileSync(path.join(BRIEFINGS_DIR, files[0]), "utf-8"),
  };
}

function getNextEdition(latestBriefing) {
  if (!latestBriefing) return 1;
  const match = latestBriefing.content.match(/^edition:\s*(\d+)/m);
  return match ? parseInt(match[1], 10) + 1 : 1;
}

function getTodayDate() {
  const d = new Date();
  return d.toISOString().split("T")[0];
}

function stripCodeFences(text) {
  // Gemini sometimes wraps the whole response in ```markdown ... ```
  return text.replace(/^```(?:markdown)?\s*\n?/i, "").replace(/\n?```\s*$/, "");
}

async function main() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error("ERROR: GOOGLE_API_KEY environment variable is not set.");
    process.exit(1);
  }

  // 1. Load system prompt
  if (!fs.existsSync(PROMPT_PATH)) {
    console.error(`ERROR: System prompt not found at ${PROMPT_PATH}`);
    process.exit(1);
  }
  const systemPrompt = fs.readFileSync(PROMPT_PATH, "utf-8");

  // 2. Find knowledge base files
  const kbFiles = findKnowledgeBaseFiles();
  if (kbFiles.length === 0) {
    console.error(
      `ERROR: No knowledge base files found in ${SKILLS_DIR} from the last ${MAX_AGE_DAYS} days.`
    );
    process.exit(1);
  }
  console.log(`Found ${kbFiles.length} knowledge base file(s):`);
  kbFiles.forEach((f) => console.log(`  - ${f}`));

  // 3. Read knowledge base content
  const kbContent = kbFiles
    .map((f) => {
      const content = fs.readFileSync(path.join(SKILLS_DIR, f), "utf-8");
      return `## Source: ${f}\n\n${content}`;
    })
    .join("\n\n---\n\n");

  // 4. Get previous briefing for context
  const latest = getLatestBriefing();
  const edition = getNextEdition(latest);
  const today = getTodayDate();

  let previousContext = "";
  if (latest) {
    console.log(`Previous briefing: ${latest.name} (Edition #${edition - 1})`);
    previousContext = `\n\n## Previous Briefing (DO NOT repeat this content)\n\n${latest.content}`;
  } else {
    console.log("No previous briefing found. This will be Edition #1.");
  }

  // 5. Build user message
  const userMessage = `Today is ${today}. This is Edition #${edition}.

Generate a complete weekly briefing using the knowledge base content below. Follow the template and all rules from your system instructions exactly.

## Knowledge Base Content

${kbContent}${previousContext}`;

  // 6. Call Gemini
  console.log(`\nCalling Gemini (gemini-2.5-flash) for Edition #${edition}...`);
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: userMessage,
    config: {
      systemInstruction: systemPrompt,
    },
  });
  let text = response.text;

  // 7. Clean up response
  text = stripCodeFences(text);

  // 8. Save briefing
  if (!fs.existsSync(BRIEFINGS_DIR)) {
    fs.mkdirSync(BRIEFINGS_DIR, { recursive: true });
  }
  const outputPath = path.join(BRIEFINGS_DIR, `${today}.md`);
  fs.writeFileSync(outputPath, text, "utf-8");

  // 9. Report
  const wordCount = text.split(/\s+/).length;
  const title = text.match(/^title:\s*"(.+)"/m)?.[1] || "(no title found)";
  console.log(`\nBriefing generated successfully!`);
  console.log(`  Title: ${title}`);
  console.log(`  Edition: #${edition}`);
  console.log(`  Words: ${wordCount}`);
  console.log(`  Sources: ${kbFiles.join(", ")}`);
  console.log(`  Output: ${outputPath}`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message || err);
  process.exit(1);
});
