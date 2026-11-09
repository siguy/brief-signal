// Tests for build.js image handling.
// Run: node build.test.js
//
// Why: build.js used to copy the whole images folder into every edition,
// which pushed the site past GitHub Pages' 1 GB limit and made deploys time out.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { referencedImages } = require('./build');

let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}

test('referencedImages finds ./images/ references once each', () => {
  const md = '![a](./images/one.jpg)\ntext\n![b](./images/two.png)\n![a again](./images/one.jpg)';
  assert.deepStrictEqual(referencedImages(md).sort(), ['one.jpg', 'two.png']);
});

test('referencedImages ignores other links', () => {
  assert.deepStrictEqual(referencedImages('[x](https://example.com/images/a.jpg)'), []);
});

// Full build: each edition folder holds only the images its markdown uses.
execFileSync('node', [path.join(__dirname, 'build.js')], { stdio: 'ignore' });
const DIST = path.join(__dirname, 'dist', 'briefings');
const CONTENT = path.join(__dirname, 'content', 'briefings');

test('each edition copies only its referenced images', () => {
  for (const file of fs.readdirSync(CONTENT).filter(f => f.endsWith('.md'))) {
    const slug = file.replace(/\.md$/, '');
    const imgDir = path.join(DIST, slug, 'images');
    const copied = fs.existsSync(imgDir) ? fs.readdirSync(imgDir).sort() : [];
    const wanted = referencedImages(fs.readFileSync(path.join(CONTENT, file), 'utf8'))
      .filter(n => fs.existsSync(path.join(CONTENT, 'images', n))).sort();
    assert.deepStrictEqual(copied, wanted, `${slug}: copied ${copied.length}, references ${wanted.length}`);
  }
});

test('built site stays well under the 1 GB Pages limit', () => {
  const size = (dir) => fs.readdirSync(dir, { withFileTypes: true })
    .reduce((n, e) => n + (e.isDirectory() ? size(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0);
  const mb = size(path.join(__dirname, 'dist')) / 1e6;
  assert.ok(mb < 500, `dist is ${mb.toFixed(0)} MB`);
});

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nAll build tests passed');
