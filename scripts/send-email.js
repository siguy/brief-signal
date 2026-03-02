const fs = require('fs');
const path = require('path');

// Reads the latest briefing and sends a subscriber email via Buttondown API.
// Skips if an email for this edition was already sent (idempotency).
// Requires: BUTTONDOWN_API_KEY env var.

const CONTENT_DIR = path.join(__dirname, '..', 'content', 'briefings');
const SITE_URL = 'https://siguy.github.io/brief-signal';

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return {};
  const meta = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    meta[key] = val;
  }
  return meta;
}

function getLatestBriefing() {
  const files = fs.readdirSync(CONTENT_DIR)
    .filter(f => f.endsWith('.md'))
    .sort()
    .reverse();
  if (files.length === 0) throw new Error('No briefings found');
  const raw = fs.readFileSync(path.join(CONTENT_DIR, files[0]), 'utf-8');
  const meta = parseFrontmatter(raw);
  const slug = files[0].replace('.md', '');

  // Extract TLDR section for the teaser
  const tldrMatch = raw.match(/## TLDR\n\n([\s\S]*?)(?=\n##|\n---|\n$)/);
  const tldr = tldrMatch ? tldrMatch[1].trim() : '';

  return { ...meta, slug, tldr };
}

async function buttondown(method, endpoint, body) {
  const apiKey = process.env.BUTTONDOWN_API_KEY;
  if (!apiKey) throw new Error('BUTTONDOWN_API_KEY env var not set');

  const opts = {
    method,
    headers: {
      'Authorization': `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`https://api.buttondown.com/v1/${endpoint}`, opts);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Buttondown API ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function alreadySent(title) {
  // Check recent emails to see if we already sent one for this edition
  const data = await buttondown('GET', 'emails?page=1');
  const emails = data.results || [];
  return emails.some(e => e.subject && e.subject.includes(title.slice(0, 40)));
}

async function main() {
  const briefing = getLatestBriefing();
  const briefingUrl = `${SITE_URL}/briefings/${briefing.slug}/`;

  console.log(`Latest briefing: ${briefing.title} (${briefing.slug})`);

  // Idempotency: skip if already sent
  if (await alreadySent(briefing.title)) {
    console.log(`Email for "${briefing.title}" already sent — skipping.`);
    return;
  }

  const edition = briefing.edition ? `Edition #${briefing.edition}` : '';
  const subject = `Brief Signal${edition ? ` — ${edition}` : ''}: ${briefing.title}`;
  const subtitle = briefing.subtitle || '';
  const tldr = briefing.tldr || '';

  const body = `
<div style="background-color: #0D0D12; padding: 40px 20px; font-family: 'Inter', -apple-system, sans-serif;">
  <div style="max-width: 560px; margin: 0 auto;">
    <p style="color: #C9A84C; font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; margin: 0 0 24px 0; font-weight: 600;">Brief Signal</p>
    <h1 style="color: #FAF8F5; font-size: 24px; line-height: 1.3; margin: 0 0 12px 0; font-weight: 700;">${briefing.title}</h1>
    <p style="color: #C9A84C; font-size: 12px; letter-spacing: 0.15em; text-transform: uppercase; margin: 0 0 32px 0; opacity: 0.8;">${subtitle}</p>
    <div style="border-top: 1px solid rgba(201, 168, 76, 0.2); padding-top: 24px; margin-bottom: 32px;">
      <p style="color: #B0ADA8; font-size: 15px; line-height: 1.6; margin: 0;">${tldr}</p>
    </div>
    <a href="${briefingUrl}" style="display: inline-block; background-color: #C9A84C; color: #0D0D12; padding: 12px 28px; text-decoration: none; font-size: 14px; font-weight: 600; border-radius: 6px;">Read the full briefing →</a>
    <p style="color: #5A5862; font-size: 12px; margin-top: 40px;">Curated by Simon Brief</p>
  </div>
</div>`.trim();

  try {
    const email = await buttondown('POST', 'emails', {
      subject,
      body,
      status: 'about_to_send',
    });
    console.log(`Email sent: "${subject}" (id: ${email.id})`);
  } catch (err) {
    if (err.message && err.message.includes('email_duplicate')) {
      console.log(`Email for ${briefing.slug} already exists in Buttondown — skipping.`);
      return;
    }
    throw err;
  }
}

main().catch(err => {
  console.error('Failed to send email:', err.message);
  process.exit(1);
});
