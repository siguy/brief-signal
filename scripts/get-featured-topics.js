#!/usr/bin/env node
// Scans all briefings, extracts featured_topics from frontmatter + source URLs from body.
// Used by generate-briefing skill to avoid repeating content across editions.

const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'content', 'briefings');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort();

const editions = [];

for (const file of files) {
  const raw = fs.readFileSync(path.join(dir, file), 'utf8');
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) continue;

  const date = file.replace('.md', '');
  const topics = [];
  const lines = fmMatch[1].split('\n');
  let inTopics = false;

  for (const line of lines) {
    if (line.startsWith('featured_topics:')) { inTopics = true; continue; }
    if (inTopics) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ')) { topics.push(trimmed.slice(2)); }
      else { inTopics = false; }
    }
  }

  // Extract source URLs from body
  const bodyMatch = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  const urls = bodyMatch ? (bodyMatch[1].match(/https:\/\/[^\s)]+/g) || []) : [];

  editions.push({ date, topics, urls });
}

// Output
for (const { date, topics, urls } of editions) {
  console.log(`\n## ${date}`);
  if (topics.length) {
    console.log('Topics:');
    topics.forEach(t => console.log(`  - ${t}`));
  }
  console.log(`URLs: ${urls.length} source links`);
}

const totalTopics = editions.reduce((n, e) => n + e.topics.length, 0);
console.log(`\n---\nTotal: ${totalTopics} topics, ${editions.length} editions`);
