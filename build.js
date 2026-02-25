const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const CONTENT_DIR = path.join(__dirname, 'content', 'briefings');
const TEMPLATE_PATH = path.join(__dirname, 'template.html');
const STATIC_DIR = path.join(__dirname, 'static');
const DIST_DIR = path.join(__dirname, 'dist');

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

function render(template, vars) {
  let html = template;
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

    // Rewrite ./images/ paths to absolute /briefings/slug/images/ for HTML
    const bodyForBriefing = b.body;
    const articleHtml = renderMarkdown(bodyForBriefing);
    const content = `<article>
      ${articleHtml}
    </article>`;
    const html = render(template, {
      title: b.title || b.slug,
      subtitle: b.subtitle || '',
      url: `/briefings/${b.slug}/`,
      sources: b.sources || '',
      content,
    });
    fs.writeFileSync(path.join(briefingDir, 'index.html'), html);
  }

  // Build index (latest briefing)
  const latest = briefings[0];

  // Copy images to dist root so index.html can reference them with relative paths
  const rootImagesDir = path.join(DIST_DIR, 'images');
  const sourceImages = path.join(CONTENT_DIR, 'images');
  if (fs.existsSync(sourceImages)) {
    ensureDir(rootImagesDir);
    copyDir(sourceImages, rootImagesDir);
  }

  // index.html lives at dist/index.html, images at dist/images/ — relative ./images/ works
  const latestHtml = renderMarkdown(latest.body);
  const indexContent = `<article>
    ${latestHtml}
  </article>`;
  const indexPage = render(template, {
    title: latest.title || latest.slug,
    subtitle: latest.subtitle || '',
    url: '/',
    sources: latest.sources || '',
    content: indexContent,
  });
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), indexPage);

  // Build archive page
  ensureDir(path.join(DIST_DIR, 'archive'));
  const archiveItems = briefings.map(b =>
    `<li><a href="/briefings/${b.slug}/"><span class="archive-date">${b.date || b.slug}</span><br><span class="archive-title">${b.title || b.slug}</span></a></li>`
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
    content: archiveContent,
  });
  fs.writeFileSync(path.join(DIST_DIR, 'archive', 'index.html'), archivePage);

  console.log(`Built ${briefings.length} briefing(s):`);
  for (const b of briefings) {
    console.log(`  - ${b.slug}: ${b.title || '(untitled)'}`);
  }
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
