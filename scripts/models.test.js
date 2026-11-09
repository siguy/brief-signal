// Guards the "one place for the model name" rule (scripts/models.js).
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

test("config/models.json names a text model", () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, "config", "models.json"), "utf-8"));
  assert.match(cfg.text, /^gemini-/);
});

test("GEMINI_TEXT_MODEL overrides the config", () => {
  const out = execFileSync("node", ["-e", 'process.stdout.write(require("./scripts/models.js").TEXT_MODEL)'], {
    cwd: root,
    env: { ...process.env, GEMINI_TEXT_MODEL: "gemini-test-override" },
  }).toString();
  assert.strictEqual(out, "gemini-test-override");
});

test("no pipeline script hardcodes a Gemini text model", () => {
  const offenders = [];
  for (const f of fs.readdirSync(path.join(root, "scripts"))) {
    if (!/\.(js|py)$/.test(f) || /\.test\./.test(f)) continue;
    if (f === "models.js" || f === "generate-audio.js") continue; // TTS stays pinned there on purpose
    const src = fs.readFileSync(path.join(root, "scripts", f), "utf-8");
    if (/model\s*[:=]\s*["']gemini-/.test(src)) offenders.push(f);
  }
  assert.deepStrictEqual(offenders, [], `hardcoded model in: ${offenders.join(", ")} — use scripts/models.js`);
});

console.log(`models.test.js: ${passed} passed`);
