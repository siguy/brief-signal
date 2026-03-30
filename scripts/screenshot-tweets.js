#!/usr/bin/env node
/**
 * Screenshot tweets using Playwright with authenticated cookies.
 * Usage: node scripts/screenshot-tweets.js
 */
const { chromium } = require("playwright");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const TWEETS = [
  {
    url: "https://x.com/rauchg/status/2036447879985037495",
    filename: "saas-disruption-agents.jpg",
  },
  {
    url: "https://x.com/Padday/status/2037202485647958289",
    filename: "vertical-ai-api-tax.jpg",
  },
  {
    url: "https://x.com/AnthropicAI/status/2036481033621623056",
    filename: "anthropic-multi-agent-harness.jpg",
  },
];

const IMAGES_DIR = path.join(
  __dirname,
  "..",
  "content",
  "briefings",
  "images"
);

async function main() {
  const ct0 = process.env.X_CT0;
  const authToken = process.env.X_AUTH_TOKEN;
  if (!ct0 || !authToken) {
    console.error("Missing X_CT0 or X_AUTH_TOKEN in .env");
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 800, height: 900 },
    deviceScaleFactor: 2,
  });

  // Set X cookies for authentication
  await context.addCookies([
    {
      name: "ct0",
      value: ct0,
      domain: ".x.com",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "None",
    },
    {
      name: "auth_token",
      value: authToken,
      domain: ".x.com",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "None",
    },
  ]);

  for (const tweet of TWEETS) {
    console.log(`Capturing: ${tweet.url}`);
    const page = await context.newPage();

    try {
      await page.goto(tweet.url, { waitUntil: "domcontentloaded", timeout: 30000 });

      // Wait for the tweet article to render
      const article = await page.waitForSelector('article[data-testid="tweet"]', {
        timeout: 15000,
      });

      // Give images/avatars a moment to load
      await page.waitForTimeout(2000);

      // Screenshot just the tweet element
      const outPath = path.join(IMAGES_DIR, tweet.filename);
      await article.screenshot({ path: outPath, type: "jpeg", quality: 92 });
      console.log(`  Saved: ${outPath}`);
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  console.log("Done.");
}

main();
