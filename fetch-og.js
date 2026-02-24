const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');

const CONTENT_DIR = path.join(__dirname, 'content', 'briefings');

// Extract image references and map to source URLs for OG fetching
// Format in markdown: ![alt](./images/slug.jpg)
// We need a mapping from slug to a URL to fetch OG image from.
// The briefing author includes source links nearby — we extract the first
// URL in the same section as each image tag.

async function fetchOGImage(url) {
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
    if (ogMatch) return ogMatch[1];

    const twMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
    if (twMatch) return twMatch[1];

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
    fs.writeFileSync(destPath, buffer);
    return true;
  } catch (e) {
    console.log(`  [skip] Failed to download image: ${e.message}`);
    return false;
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

    // Search nearby lines (up to 10 below) for the first URL
    let sourceUrl = null;
    for (let j = i + 1; j < Math.min(i + 12, lines.length); j++) {
      const urlMatch = lines[j].match(/\((https?:\/\/[^)]+)\)/);
      if (urlMatch) {
        sourceUrl = urlMatch[1];
        break;
      }
    }

    if (sourceUrl) {
      images.push({ alt, filename, sourceUrl, line: i + 1 });
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

    console.log(`  Fetching OG from ${img.sourceUrl}...`);
    const ogImageUrl = await fetchOGImage(img.sourceUrl);

    if (!ogImageUrl) {
      console.log(`  [no og:image] ${img.sourceUrl}`);
      // Create a placeholder SVG
      createPlaceholder(destPath, img.alt);
      continue;
    }

    console.log(`  Downloading ${ogImageUrl}...`);
    const ok = await downloadImage(ogImageUrl, destPath);
    if (!ok) {
      createPlaceholder(destPath, img.alt);
    } else {
      console.log(`  [ok] ${img.filename}`);
    }
  }
}

function createPlaceholder(destPath, alt) {
  // Create a simple SVG placeholder
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#1a1a2e"/>
  <text x="600" y="300" font-family="system-ui, sans-serif" font-size="32" fill="#8b949e" text-anchor="middle" dominant-baseline="middle">${alt.replace(/[<>&"']/g, '')}</text>
  <text x="600" y="360" font-family="system-ui, sans-serif" font-size="18" fill="#555" text-anchor="middle" dominant-baseline="middle">Image unavailable</text>
</svg>`;
  // Save as .jpg extension but SVG content — we'll handle in build
  // Actually save as SVG with correct extension
  const svgPath = destPath.replace(/\.(jpg|png|jpeg)$/, '.svg');
  fs.writeFileSync(svgPath, svg);
  // Also copy to .jpg path so markdown references work
  fs.writeFileSync(destPath, svg);
  console.log(`  [placeholder] ${path.basename(destPath)}`);
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

main();
