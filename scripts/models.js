/**
 * The ONE place the pipeline's text-model name lives.
 *
 * Before this file, "gemini-3.8-flash" was typed out in 9 places across 6
 * scripts (JS and Python), so every model upgrade meant hunting them all down
 * — and missing one left that stage silently on the old model.
 *
 * To upgrade: edit config/models.json (Python reads the same file).
 * To try a model for one run without touching code: set GEMINI_TEXT_MODEL in
 * .env or the shell. Confirm a new ID against the live ListModels API first —
 * model-card slugs and API IDs differ (gemini-3-7-flash vs gemini-3.7-flash).
 *
 * The TTS model is deliberately NOT here: it stays pinned in generate-audio.js
 * because a TTS swap needs an A/B listen, never a config bump.
 */
const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "..", "config", "models.json");

function textModel() {
  const override = (process.env.GEMINI_TEXT_MODEL || "").trim();
  if (override) return override;
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")).text;
}

module.exports = { TEXT_MODEL: textModel(), textModel, CONFIG_PATH };
