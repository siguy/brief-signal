const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const CONTENT_DIR = path.join(__dirname, 'content', 'briefings');
const AUDIO_DIR = path.join(__dirname, 'content', 'audio');
const TEMPLATE_PATH = path.join(__dirname, 'template.html');
const STATIC_DIR = path.join(__dirname, 'static');
const DIST_DIR = path.join(__dirname, 'dist');

// Base path for GitHub Pages subdirectory deployment (e.g. "/brief-signal")
// Set via BASE_PATH env var; defaults to "" for local dev / custom domain
const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/+$/, '');

// Google Form for weekly feedback — replace with your actual form ID and entry ID
// To get the entry ID: Form menu → "Get pre-filled link" → fill Edition Date → "Get link"
const GOOGLE_FORM_BASE_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSeiTx6YoD4obRaed4sVz2oKjV-NubT68YmQPhAZHV4fg3eZWA/viewform';
const GOOGLE_FORM_EDITION_ENTRY = 'entry.659640151';

// Buttondown email subscribe — replace with your Buttondown username after signup
const BUTTONDOWN_USERNAME = 'briefsignal';

// Parse YAML-ish frontmatter (simple key: value pairs between --- fences)
function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };
  const meta = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    meta[key] = val;
  }
  
  let bodyStr = match[2];
  let sources = '';
  
  // Extract "*Sources: X bookmarks... [Archive](/archive)*"
  const sourceMatch = bodyStr.match(/\n\*(Sources:[\s\S]*?)\*\s*$/);
  if (sourceMatch) {
    // Strip it out of the markdown body and render it to HTML directly for the footer
    bodyStr = bodyStr.replace(sourceMatch[0], '');
    sources = renderMarkdown(sourceMatch[1]).replace(/<\/?p>/g, ''); // strip paragraph wrappers
    sources = sources.replace(/href="\/archive"/g, `href="${BASE_PATH}/archive"`);
  }
  
  return { meta, body: bodyStr, sources };
}

// Render markdown and inject custom styling wrappers (e.g. for "Our Play")
function renderMarkdown(md) {
  let html = marked(md);
  
  // Wrap the "Our Play" section in a special styled container.
  // This looks for an <h2> that says "Our Play", and wraps it and all following 
  // siblings until the next <h2> or end of file into a special div.
  html = html.replace(
    /(<h2[^>]*>Our Play<\/h2>)([\s\S]*?)(?=<h2|$)/gi, 
    '<div class="our-play-section">\n$1\n$2\n</div>'
  );
  
  return html;
}

// Check if an audio file exists for a given briefing slug
function getAudioPath(slug) {
  const mp3 = path.join(AUDIO_DIR, `${slug}.mp3`);
  return fs.existsSync(mp3) ? mp3 : null;
}

// Read all briefings, sorted newest first
function loadBriefings() {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  return fs.readdirSync(CONTENT_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const raw = fs.readFileSync(path.join(CONTENT_DIR, f), 'utf-8');
      const { meta, body, sources } = parseFrontmatter(raw);
      const slug = f.replace('.md', '');
      return { ...meta, slug, body, sources, filename: f };
    })
    .sort((a, b) => (b.date || b.slug).localeCompare(a.date || a.slug));
}

// Compute the base prefix for asset paths. On GitHub Pages (BASE_PATH set),
// use the absolute prefix. For local dev (no BASE_PATH), use a relative path
// so file:// URLs work without a server.
function getBase(depth) {
  if (BASE_PATH) return BASE_PATH;
  if (depth <= 0) return '.';
  return Array(depth).fill('..').join('/');
}

function render(template, vars) {
  let html = template;
  vars.base = vars.base || BASE_PATH;
  for (const [key, val] of Object.entries(vars)) {
    html = html.replaceAll(`{{${key}}}`, val || '');
  }
  return html;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function build() {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
  const briefings = loadBriefings();

  // Clean dist
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true });
  }
  ensureDir(DIST_DIR);

  // Copy static files
  if (fs.existsSync(STATIC_DIR)) {
    copyDir(STATIC_DIR, DIST_DIR);
  }

  if (briefings.length === 0) {
    const html = render(template, {
      title: 'Brief Signal',
      subtitle: 'Weekly AI market intelligence for startup conversations',
      url: '/',
      audio_player: '',
      feedback_cta: '',
      content: '<article><h1>Coming Soon</h1><p>The first briefing is on its way.</p></article>',
    });
    fs.writeFileSync(path.join(DIST_DIR, 'index.html'), html);
    console.log('Built empty site (no briefings yet)');
    return;
  }

  // Build individual briefing pages
  for (const b of briefings) {
    const briefingDir = path.join(DIST_DIR, 'briefings', b.slug);
    ensureDir(briefingDir);

    // Copy images for this briefing
    const imagesDir = path.join(CONTENT_DIR, 'images');
    if (fs.existsSync(imagesDir)) {
      const destImages = path.join(briefingDir, 'images');
      ensureDir(destImages);
      copyDir(imagesDir, destImages);
    }

    // Copy audio file if it exists
    const audioSrc = getAudioPath(b.slug);
    let audioPlayer = '';
    if (audioSrc) {
      const distAudioDir = path.join(DIST_DIR, 'audio');
      ensureDir(distAudioDir);
      const audioFilename = `${b.slug}.mp3`;
      fs.copyFileSync(audioSrc, path.join(distAudioDir, audioFilename));
      const audioUrl = `${getBase(2)}/audio/${audioFilename}`;
      audioPlayer = `<div class="audio-player" id="audioPlayer">
  <button class="audio-play-btn" id="audioPlayBtn" aria-label="Play audio briefing">
    <svg class="audio-icon-play" id="audioIconPlay" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
    <svg class="audio-icon-pause" id="audioIconPause" viewBox="0 0 24 24" fill="currentColor" style="display:none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
  </button>
  <div class="audio-info">
    <div class="audio-label">Listen to this briefing <span class="audio-beta">(beta)</span></div>
    <div class="audio-time"><span id="audioCurrent">0:00</span> / <span id="audioDuration">0:00</span></div>
  </div>
  <div class="audio-progress-wrap" id="audioProgressWrap">
    <div class="audio-progress-bar" id="audioProgressBar"></div>
  </div>
  <a class="audio-download-btn" href="${audioUrl}" download="brief-signal-${b.slug}.mp3" aria-label="Download audio briefing">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
  </a>
  <audio id="audioElement" preload="metadata" src="${audioUrl}"></audio>
</div>`;
    }

    // Rewrite ./images/ paths to absolute /briefings/slug/images/ for HTML
    const bodyForBriefing = b.body;
    const articleHtml = renderMarkdown(bodyForBriefing);
    const content = `<article>
      ${articleHtml}
    </article>`;

    // Build feedback CTA with pre-filled edition date
    const feedbackUrl = `${GOOGLE_FORM_BASE_URL}?usp=pp_url&${GOOGLE_FORM_EDITION_ENTRY}=${encodeURIComponent(b.date || b.slug)}`;
    const feedbackCta = `<div class="feedback-cta" id="feedbackCta">
  <p class="feedback-label">Signal Check</p>
  <h3 class="feedback-heading">Was this briefing useful?</h3>
  <p class="feedback-subtext">Takes 60 seconds. Your feedback shapes next week's edition.</p>
  <a href="${feedbackUrl}" target="_blank" rel="noopener" class="feedback-cta-btn">Share Feedback</a>
</div>`;

    const html = render(template, {
      title: b.title || b.slug,
      subtitle: b.subtitle || '',
      url: `/briefings/${b.slug}/`,
      sources: b.sources || '',
      audio_player: audioPlayer,
      feedback_cta: feedbackCta,
      base: getBase(2), // dist/briefings/slug/ → 2 levels deep
      content,
    });
    fs.writeFileSync(path.join(briefingDir, 'index.html'), html);
  }

  // Build index as redirect to latest briefing's permalink
  const latest = briefings[0];
  const latestUrlRel = `briefings/${latest.slug}/`;
  const latestUrlAbs = `${BASE_PATH}/briefings/${latest.slug}/`;
  const latestRedirect = BASE_PATH ? latestUrlAbs : latestUrlRel;
  const indexRedirect = `<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="refresh" content="0;url=${latestRedirect}" />
  <link rel="canonical" href="${latestUrlAbs}" />
  <title>Brief Signal</title>
</head>
<body>
  <p>Redirecting to <a href="${latestRedirect}">the latest briefing</a>...</p>
</body>
</html>`;
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), indexRedirect);

  // Build archive page
  ensureDir(path.join(DIST_DIR, 'archive'));
  const archiveBase = BASE_PATH ? `${BASE_PATH}/briefings` : '../briefings';
  const archiveItems = briefings.map(b =>
    `<li><a href="${archiveBase}/${b.slug}/"><span class="archive-date">${b.date || b.slug}</span><br><span class="archive-title">${b.title || b.slug}</span></a></li>`
  ).join('\n');
  const archiveContent = `<article>
    <h1>Archive</h1>
    <p class="subtitle">All editions of Brief Signal</p>
    <ul class="archive-list">${archiveItems}</ul>
  </article>`;
  const archivePage = render(template, {
    title: 'Archive',
    subtitle: 'All editions of Brief Signal',
    url: '/archive/',
    audio_player: '',
    feedback_cta: '',
    base: getBase(1), // dist/archive/ → 1 level deep
    content: archiveContent,
  });
  fs.writeFileSync(path.join(DIST_DIR, 'archive', 'index.html'), archivePage);

  // Build subscribe page
  ensureDir(path.join(DIST_DIR, 'subscribe'));
  const subscribeBase = getBase(1); // dist/subscribe/ → 1 level deep
  const formAction = `https://buttondown.com/api/emails/embed-subscribe/${BUTTONDOWN_USERNAME}`;
  const subscribeContent = `<article>
    <div class="subscribe-section">
      <p class="subscribe-label">Weekly Briefing</p>
      <h2 class="subscribe-heading">The founder signal your competitors are missing.</h2>
      <p class="subscribe-pitch">Every week, we distill our POV on what startup founders are reading, building, and debating into a 5-minute briefing. Open source momentum, builder patterns, founder moves — the context that makes your next meeting land differently.</p>
      <form class="subscribe-form" action="${formAction}" method="post">
        <div class="subscribe-fields">
          <input type="text" name="metadata__first_name" placeholder="First name" required class="subscribe-input" />
          <input type="email" name="email" placeholder="Email address" required class="subscribe-input" />
        </div>
        <button type="submit" class="subscribe-btn">Subscribe</button>
      </form>
      <p class="subscribe-fine-print">One email per week. Unsubscribe anytime.</p>
    </div>
  </article>`;
  const subscribePage = render(template, {
    title: 'Never Miss a Signal',
    subtitle: 'Subscribe',
    url: '/subscribe/',
    audio_player: '',
    feedback_cta: '',
    sources: '',
    base: subscribeBase,
    content: subscribeContent,
  });
  fs.writeFileSync(path.join(DIST_DIR, 'subscribe', 'index.html'), subscribePage);

  console.log(`Built ${briefings.length} briefing(s):`);
  for (const b of briefings) {
    console.log(`  - ${b.slug}: ${b.title || '(untitled)'}`);
  }
  console.log(`Built subscribe page`);
  console.log(`Output: ${DIST_DIR}`);
}

function copyDir(src, dest) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      ensureDir(destPath);
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

build();
