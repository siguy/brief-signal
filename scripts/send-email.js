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

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Inline markdown -> HTML for the few things TLDR bullets use: **bold**, *italic*, [text](url)
function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" style="color: #8A6D1F;">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong style="color: #0D0D12;">$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
}

// Turns "- **Hook** detail" lines into one table row per bullet (tables are the most
// reliable layout across Gmail/Outlook/Apple Mail).
function renderTldrRows(tldr) {
  return tldr
    .split('\n')
    .map(line => line.trim())
    .filter(line => /^[-*]\s+/.test(line))
    .map(line => line.replace(/^[-*]\s+/, ''))
    .map(item => `<tr><td valign="top" style="padding: 0 12px 16px 0; color: #C9A84C; font-size: 16px; line-height: 24px;">&#9679;</td><td style="padding: 0 0 16px 0; color: #3A3842; font-size: 16px; line-height: 24px;">${inlineMarkdown(item)}</td></tr>`)
    .join('');
}

// Light card with a dark brand header: stays readable whether the client is in light or
// dark mode. No blank lines or indentation, or Buttondown's markdown pass would mangle it.
function renderEmailBody({ title, subtitle, tldr, briefingUrl }) {
  const font = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
  const rows = renderTldrRows(tldr);
  return [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #F2F0EB; font-family: ${font};"><tr><td align="center" style="padding: 24px 12px;">`,
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #FFFFFF; border-radius: 8px; overflow: hidden;">`,
    `<tr><td style="background-color: #0D0D12; padding: 28px 32px;">`,
    `<div style="color: #C9A84C; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; font-weight: 700; margin-bottom: 14px;">Brief Signal</div>`,
    `<div style="color: #FAF8F5; font-size: 22px; line-height: 30px; font-weight: 700;">${escapeHtml(title)}</div>`,
    subtitle ? `<div style="color: #C9A84C; font-size: 13px; line-height: 20px; margin-top: 12px;">${escapeHtml(subtitle)}</div>` : '',
    `</td></tr>`,
    `<tr><td style="padding: 28px 32px 12px 32px;">`,
    `<div style="color: #8A6D1F; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; font-weight: 700; margin-bottom: 18px;">The week in brief</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`,
    `</td></tr>`,
    `<tr><td style="padding: 8px 32px 36px 32px;">`,
    `<a href="${briefingUrl}" style="display: inline-block; background-color: #0D0D12; color: #FAF8F5 !important; padding: 14px 28px; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 6px; border-bottom: 3px solid #C9A84C;"><span style="color: #FAF8F5 !important;">Read the full briefing &rarr;</span></a>`,
    `</td></tr>`,
    `<tr><td style="padding: 20px 32px; border-top: 1px solid #E8E4DB; color: #8A8790; font-size: 12px; line-height: 18px;">Curated by Simon Brief. A weekly read on what founders are building, reading, and talking about.</td></tr>`,
    `</table></td></tr></table>`,
  ].filter(Boolean).join('\n');
}

// "Brief Signal | Edition #34 | Oct 11, 2026 | 5 min read"
function buildSubject(briefing) {
  const readTime = (briefing.subtitle || '').match(/~?\s*(\d+)\s*min read/i);
  const date = briefing.date
    ? new Date(`${briefing.date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    : '';
  const parts = [
    'Brief Signal',
    briefing.edition ? `Edition #${briefing.edition}` : briefing.title,
    date,
    readTime ? `${readTime[1]} min read` : '',
  ];
  return parts.filter(Boolean).join(' | ');
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

async function alreadySent(briefing) {
  // Check recent emails to see if we already sent one for this edition.
  // The subject's edition segment ("| Edition #34 |") is the key; bracketed [TEST] drafts don't count.
  const marker = briefing.edition ? `| Edition #${briefing.edition} |` : briefing.title.slice(0, 40);
  const data = await buttondown('GET', 'emails?page=1');
  const emails = data.results || [];
  return emails.some(e => e.subject && !e.subject.startsWith('[TEST]') && e.subject.includes(marker));
}

async function main() {
  const briefing = getLatestBriefing();
  const briefingUrl = `${SITE_URL}/briefings/${briefing.slug}/`;

  console.log(`Latest briefing: ${briefing.title} (${briefing.slug})`);

  // Idempotency: skip if already sent
  if (await alreadySent(briefing)) {
    console.log(`Email for "${briefing.title}" already sent — skipping.`);
    return;
  }

  const subject = buildSubject(briefing);
  const subtitle = briefing.subtitle || '';
  const tldr = briefing.tldr || '';

  const body = renderEmailBody({ title: briefing.title, subtitle, tldr, briefingUrl });

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

if (require.main === module) {
  main().catch(err => {
    console.error('Failed to send email:', err.message);
    process.exit(1);
  });
}

module.exports = { renderEmailBody, renderTldrRows, buildSubject };
