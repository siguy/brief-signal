const assert = require('assert');
const { renderEmailBody, renderTldrRows, buildSubject } = require('./send-email');

const tldr = [
  '- **Meta cut Claude usage by 50%,** substituting in-house models.',
  '- **Nadella said models are "insider risks" <b>.** See [the clip](https://example.com/x).',
  '- **Our play:** route to open weights.',
].join('\n');

const rows = renderTldrRows(tldr);
assert.strictEqual((rows.match(/<tr>/g) || []).length, 3, 'one row per bullet');
assert.ok(!rows.includes('**'), 'no literal markdown asterisks');
assert.ok(rows.includes('<strong'), 'bold hooks rendered');
assert.ok(rows.includes('href="https://example.com/x"'), 'links rendered');
assert.ok(rows.includes('&lt;b&gt;'), 'HTML in content is escaped');

const body = renderEmailBody({
  title: 'A & B', subtitle: 'Week of X', tldr, briefingUrl: 'https://example.com/b/',
});
assert.ok(body.includes('A &amp; B'), 'title escaped');
assert.ok(body.includes('href="https://example.com/b/"'), 'CTA link present');
assert.ok(!/\n\s*\n/.test(body), 'no blank lines (Buttondown markdown pass would break the HTML)');
assert.ok(!/^ {4}/m.test(body), 'no indented lines (would become markdown code blocks)');

assert.ok(body.includes('<span style="color: #FAF8F5 !important;">Read the full briefing'), 'button text color survives link styling');

assert.strictEqual(
  buildSubject({ edition: '34', date: '2026-10-11', subtitle: 'Week of October 5 – October 11 | Edition #34 | ~5 min read', title: 'T' }),
  'Brief Signal | Edition #34 | Oct 11, 2026 | 5 min read');
assert.strictEqual(buildSubject({ title: 'T' }), 'Brief Signal | T', 'degrades gracefully without edition/date/length');

console.log('send-email tests passed');
