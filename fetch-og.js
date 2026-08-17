const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

const CONTENT_DIR = path.join(__dirname, 'content', 'briefings');

// Extract image references and map to source URLs for OG fetching
// Format in markdown: ![alt](./images/slug.jpg)
// We need a mapping from slug to a URL to fetch OG image from.
// The briefing author includes source links nearby — we extract the first
// URL in the same section as each image tag.

// Extract tweet ID from x.com or twitter.com URLs
function extractTweetId(url) {
  const match = url.match(/(?:x\.com|twitter\.com)\/\w+\/status\/(\d+)/);
  return match ? match[1] : null;
}

// Generate the syndication API token from a tweet ID
function syndicationToken(tweetId) {
  return ((Number(tweetId) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}

// Try Twitter's syndication API for tweet media (no auth required)
async function fetchTweetImage(tweetId) {
  const token = syndicationToken(tweetId);
  const url = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=${token}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();

    // Check for media in the tweet
    if (data.mediaDetails && data.mediaDetails.length > 0) {
      const media = data.mediaDetails[0];
      return media.media_url_https || media.display_url || null;
    }
    // Check for photos array
    if (data.photos && data.photos.length > 0) {
      return data.photos[0].url || null;
    }
    // Check for X Article cover image
    if (data.article?.cover_media?.media_info?.original_img_url) {
      return data.article.cover_media.media_info.original_img_url;
    }
    // Check for link card image (tweet links to an article with a preview)
    if (data.card) {
      const cardImg = data.card.thumbnail_image_original?.image_value?.url
        || data.card.summary_photo_image_original?.image_value?.url;
      if (cardImg) return cardImg;
    }
    // Skip user avatar — it's not the tweet's image, let Microlink screenshot handle it
    return null;
  } catch (e) {
    console.log(`  [syndication] Failed for tweet ${tweetId}: ${e.message}`);
    return null;
  }
}

// Microlink screenshot fallback (free tier: 50 req/min)
async function fetchMicrolinkScreenshot(tweetUrl) {
  try {
    const endpoint = `https://api.microlink.io?url=${encodeURIComponent(tweetUrl)}&screenshot=true&meta=false`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(endpoint, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 'success') return null;
    return data.data?.screenshot?.url || null;
  } catch (e) {
    console.log(`  [microlink] Failed: ${e.message}`);
    return null;
  }
}

// Reject og:image values that are technically valid images but useless as a
// story illustration. An x.com post page whose tweet has no media advertises the
// AUTHOR'S AVATAR as its og:image, so a story about the open-weights fight
// rendered as a 400x400 headshot — a valid JPEG, which is why the linter's
// magic-byte and size checks passed it. Falling through to the YouTube-thumbnail
// fallback gives a real, on-topic image instead.
function isUsableImage(imageUrl) {
  const rejects = [
    /pbs\.twimg\.com\/profile_images\//i,  // X avatar
    /pbs\.twimg\.com\/profile_banners\//i, // X header
    /\/default_profile/i,                  // X egg avatar
    /gravatar\.com\/avatar/i,
  ];
  if (rejects.some((re) => re.test(imageUrl))) {
    console.log(`  [reject] avatar/banner, not a story image: ${imageUrl}`);
    return false;
  }
  return true;
}

async function fetchOGImage(url) {
  // For Twitter/X URLs the syndication API is the ONLY trusted path: it returns
  // the media actually attached to the tweet.
  //
  // The Microlink screenshot fallback that used to sit here has been removed.
  // Screenshotting a logged-out x.com page reliably captures X's "See this post
  // in the app / Open X" interstitial modal dead centre over the content, and
  // the request still *succeeds* — so it short-circuited every better fallback
  // below and published a modal as the story's image. Edition #26 shipped one
  // that way (open-weights-fight-zuckerberg.jpg) and lint could not catch it:
  // the file was a perfectly valid JPEG of the wrong thing.
  //
  // A tweet with no media now falls through to the og:image sweep and the
  // YouTube-thumbnail fallback, and finally to a placeholder — all of which are
  // honest failures a human can see, unlike a plausible-looking screenshot.
  const tweetId = extractTweetId(url);
  if (tweetId) {
    console.log(`  [twitter] Trying syndication API for tweet ${tweetId}...`);
    const tweetImg = await fetchTweetImage(tweetId);
    if (tweetImg) return tweetImg;

    console.log(`  [twitter] No tweet media — falling back to OG...`);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AI-Briefing/1.0)' },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();

    // Try og:image first, then twitter:image
    const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    if (ogMatch && isUsableImage(ogMatch[1])) return ogMatch[1];

    const twMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
    if (twMatch && isUsableImage(twMatch[1])) return twMatch[1];

    return null;
  } catch (e) {
    console.log(`  [skip] Failed to fetch ${url}: ${e.message}`);
    return null;
  }
}

async function downloadImage(imageUrl, destPath) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(imageUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AI-Briefing/1.0)' },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!res.ok) return false;

    const buffer = Buffer.from(await res.arrayBuffer());
    return writeVerifiedImage(buffer, destPath);
  } catch (e) {
    console.log(`  [skip] Failed to download image: ${e.message}`);
    return false;
  }
}

// Identify an image by its magic bytes. Content-Type is not good enough — a
// server can send image/jpeg over anything, and did: 11 PNGs and a WebP are
// sitting in content/briefings/images under .jpg names today because whatever
// arrived was written to whatever extension the markdown asked for.
//
// Deliberately narrow. These are the formats we can do something about; an
// unrecognised buffer is rejected rather than guessed at, and the caller falls
// through to the YouTube thumbnail and then the placeholder.
function sniffImageFormat(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return 'png';
  if (
    buf.length >= 12 &&
    buf.slice(0, 4).toString('latin1') === 'RIFF' &&
    buf.slice(8, 12).toString('latin1') === 'WEBP'
  ) return 'webp';
  return null;
}

// What the markdown reference claims the bytes are. lint-briefing.js's image
// check keys off this same extension, so agreeing with it here is what keeps a
// download from becoming a lint hard failure later.
function expectedFormat(destPath) {
  const ext = path.extname(destPath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'jpeg';
  if (ext === '.png') return 'png';
  return null;
}

// macOS ships `sips`; nothing else does, and CI never runs this file
// (.github/workflows/deploy.yml is npm ci + npm run build). Absent it, a
// format mismatch is simply rejected — the fallback chain still runs.
let sipsLookup = null;
function hasSips() {
  if (sipsLookup === null) {
    try {
      execSync('command -v sips', { stdio: 'ignore' });
      sipsLookup = true;
    } catch {
      sipsLookup = false;
    }
  }
  return sipsLookup;
}

// Write `buffer` to destPath only if we can guarantee the bytes match the
// extension — converting when we can, refusing when we can't. Returns false
// rather than throwing so the caller's fallback chain is unchanged.
function writeVerifiedImage(buffer, destPath) {
  const actual = sniffImageFormat(buffer);
  const wanted = expectedFormat(destPath);

  if (!actual) {
    const head = buffer.slice(0, 8).toString('utf8').trimStart();
    const kind = head.startsWith('<') ? 'markup (SVG/HTML)' : 'unrecognised format';
    console.log(`  [skip] Refusing to write ${kind} to ${path.basename(destPath)}`);
    return false;
  }
  if (!wanted) {
    console.log(`  [skip] Unsupported destination extension: ${path.basename(destPath)}`);
    return false;
  }
  if (actual === wanted) {
    fs.writeFileSync(destPath, buffer);
    return true;
  }
  if (!hasSips()) {
    console.log(`  [skip] Got ${actual}, need ${wanted}, and sips is unavailable: ${path.basename(destPath)}`);
    return false;
  }

  // Convert via a temp file named with the TRUE extension — sips dispatches on
  // the input extension, so handing it a .jpg full of PNG bytes fails.
  const tmp = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'brief-signal-img-')),
    `src.${actual === 'jpeg' ? 'jpg' : actual}`
  );
  try {
    fs.writeFileSync(tmp, buffer);
    execFileSync('sips', ['-s', 'format', wanted, tmp, '--out', destPath], { stdio: 'ignore' });
    // sips can exit 0 and still produce something unusable. Trust the bytes,
    // not the exit code — that assumption is what put us here.
    const written = fs.existsSync(destPath) ? fs.readFileSync(destPath) : Buffer.alloc(0);
    if (sniffImageFormat(written) !== wanted) {
      console.log(`  [skip] sips reported success but did not produce ${wanted}: ${path.basename(destPath)}`);
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      return false;
    }
    console.log(`  [converted] ${actual} -> ${wanted}`);
    return true;
  } catch (e) {
    console.log(`  [skip] Conversion failed (${e.message}): ${path.basename(destPath)}`);
    if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
    return false;
  } finally {
    fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  }
}

// Parse a briefing and find image tags with nearby URLs
function findImageSources(markdown) {
  const lines = markdown.split('\n');
  const images = [];

  for (let i = 0; i < lines.length; i++) {
    const imgMatch = lines[i].match(/^!\[([^\]]*)\]\(\.\/images\/([^)]+)\)/);
    if (!imgMatch) continue;

    const alt = imgMatch[1];
    const filename = imgMatch[2];

    // Collect EVERY URL in the nearby lines (up to 11 below), not just the
    // first. This used to `break` on the first match, which meant a story
    // linking e.g. openai.com before its YouTube link could never reach the
    // thumbnail fallback — the one source of images that practically always
    // works. sourceUrl stays pinned to the first URL because that is the
    // story's primary source and the right target for the og:image fetch;
    // widening it would change which image every working story gets.
    // matchAll, not match: a Markdown paragraph is ONE line carrying many
    // citations, so taking only the first URL per line collected two candidates
    // for a story with a dozen links — and never reached the YouTube links that
    // the thumbnail fallback below depends on. That contradicted this comment's
    // own promise to collect every nearby URL.
    const sourceUrls = [];
    for (let j = i + 1; j < Math.min(i + 12, lines.length); j++) {
      for (const m of lines[j].matchAll(/\((https?:\/\/[^)\s]+)\)/g)) {
        sourceUrls.push(m[1]);
      }
    }

    if (sourceUrls.length) {
      images.push({ alt, filename, sourceUrl: sourceUrls[0], sourceUrls, line: i + 1 });
    }
  }
  return images;
}

async function processBriefing(filepath) {
  const slug = path.basename(filepath, '.md');
  const markdown = fs.readFileSync(filepath, 'utf-8');
  const images = findImageSources(markdown);

  if (images.length === 0) {
    console.log(`No images found in ${slug}`);
    return;
  }

  const imagesDir = path.join(path.dirname(filepath), slug, 'images');
  // Also create in content dir next to the .md for local reference
  const contentImagesDir = path.join(path.dirname(filepath), 'images');
  fs.mkdirSync(contentImagesDir, { recursive: true });

  console.log(`\nProcessing ${slug}: ${images.length} images`);

  for (const img of images) {
    const destPath = path.join(contentImagesDir, img.filename);

    // Skip if already downloaded
    if (fs.existsSync(destPath)) {
      console.log(`  [exists] ${img.filename}`);
      continue;
    }

    // Sweep EVERY nearby link for an og:image, primary source first — not just
    // the primary. A story whose first citation is an X post with no media used
    // to give up here even when a later citation was a vendor page with a
    // perfectly good og:image. Edition #26's lead is the case in point: its
    // first link is a tweet, its second is a DeepMind model card.
    //
    // Order still matters: the primary source is tried first and wins when it
    // works, so stories that already produced the right image keep it.
    let ok = false;
    for (const candidate of img.sourceUrls || [img.sourceUrl]) {
      console.log(`  Fetching OG from ${candidate}...`);
      const ogImageUrl = await fetchOGImage(candidate);
      if (!ogImageUrl) {
        console.log(`  [no og:image] ${candidate}`);
        continue;
      }
      console.log(`  Downloading ${ogImageUrl}...`);
      ok = await downloadImage(ogImageUrl, destPath);
      if (ok) break;
    }

    // Fallback: most briefing sources are YouTube episodes — the thumbnail
    // is a real, on-topic image and practically never 404s at hqdefault.
    // Try EVERY nearby link for a YouTube id, not just the primary source.
    if (!ok) {
      const thumbs = (img.sourceUrls || [img.sourceUrl]).flatMap(youtubeThumbUrls);
      for (const thumb of thumbs) {
        console.log(`  Trying YouTube thumbnail ${thumb}...`);
        ok = await downloadImage(thumb, destPath);
        if (ok) break;
      }
    }

    if (!ok) {
      createPlaceholder(destPath, img.alt);
    } else {
      console.log(`  [ok] ${img.filename}`);
    }
  }
}

// For a YouTube source URL, candidate thumbnail URLs (best-res first).
// Returns [] for non-YouTube sources.
function youtubeThumbUrls(sourceUrl) {
  const m = (sourceUrl || '').match(/(?:youtube\.com\/watch\?[^)\s]*v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  if (!m) return [];
  return [
    `https://img.youtube.com/vi/${m[1]}/maxresdefault.jpg`,
    `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg`,
  ];
}

function createPlaceholder(destPath, alt) {
  // Create a simple SVG placeholder
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#1a1a2e"/>
  <text x="600" y="300" font-family="system-ui, sans-serif" font-size="32" fill="#8b949e" text-anchor="middle" dominant-baseline="middle">${alt.replace(/[<>&"']/g, '')}</text>
  <text x="600" y="360" font-family="system-ui, sans-serif" font-size="18" fill="#555" text-anchor="middle" dominant-baseline="middle">Image unavailable</text>
</svg>`;
  // Write ONLY the .svg diagnostic — never SVG bytes into the raster path.
  // (That exact bug shipped a broken image in Edition #23: Pages served
  // image/jpeg headers with SVG bytes. The missing .jpg now fails loudly in
  // lint-briefing.js's image check instead of silently rendering broken.)
  const svgPath = destPath.replace(/\.(jpg|png|jpeg)$/, '.svg');
  fs.writeFileSync(svgPath, svg);
  // Also copy to .jpg path so markdown references work
  console.error(`  [PLACEHOLDER ONLY — no real image] ${path.basename(destPath)} missing; wrote diagnostic ${path.basename(svgPath)}. Fix the source or drop the image before merge.`);
}

async function main() {
  const files = fs.readdirSync(CONTENT_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(CONTENT_DIR, f));

  for (const f of files) {
    await processBriefing(f);
  }

  console.log('\nDone. Run `npm run build` to include images in output.');
}

// Only sweep content/briefings/ and hit the network when run as a script.
// Without this guard, `require()`ing this file from a test walks every briefing
// and starts downloading — which is why there were no tests for it.
if (require.main === module) {
  main();
}

module.exports = {
  sniffImageFormat,
  expectedFormat,
  writeVerifiedImage,
  findImageSources,
  youtubeThumbUrls,
};
