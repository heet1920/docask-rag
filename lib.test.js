import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkText, chunkPages, cosine, topK, buildPrompt } from '../lib.js';

test('chunkText returns nothing for empty input', () => {
  assert.deepEqual(chunkText(''), []);
  assert.deepEqual(chunkText('   \n\n  '), []);
});

test('chunkText keeps short text as one chunk', () => {
  assert.deepEqual(chunkText('Hello world.'), ['Hello world.']);
});

test('chunkText splits long text into bounded, overlapping chunks', () => {
  const text = Array.from({ length: 200 }, (_, i) => `Sentence number ${i} is here.`).join(' ');
  const chunks = chunkText(text, { size: 300, overlap: 60 });
  assert.ok(chunks.length > 5);
  for (const c of chunks) assert.ok(c.length <= 300, `chunk too long: ${c.length}`);
  // Overlap: the start of each chunk appears near the end of the previous one.
  for (let i = 1; i < chunks.length; i++) {
    const head = chunks[i].slice(0, 15);
    assert.ok(chunks[i - 1].includes(head), `chunk ${i} does not overlap previous`);
  }
  // Every sentence survives chunking.
  const joined = chunks.join(' ');
  for (let i = 0; i < 200; i++) assert.ok(joined.includes(`Sentence number ${i} `));
});

test('chunkPages keeps page numbers and sequential ids', () => {
  const out = chunkPages([{ page: 1, text: 'Alpha.' }, { page: 2, text: 'Beta.' }]);
  assert.deepEqual(out, [
    { id: 1, page: 1, text: 'Alpha.' },
    { id: 2, page: 2, text: 'Beta.' },
  ]);
});

test('cosine similarity behaves', () => {
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.equal(cosine([1, 0], [0, 1]), 0);
  assert.ok(Math.abs(cosine([1, 2], [-1, -2]) + 1) < 1e-12);
  assert.equal(cosine([1, 2], [1]), 0);
  assert.equal(cosine([0, 0], [1, 1]), 0);
});

test('topK ranks by similarity', () => {
  const items = [
    { text: 'a', vector: [0, 1] },
    { text: 'b', vector: [1, 0] },
    { text: 'c', vector: [0.9, 0.1] },
  ];
  const res = topK([1, 0], items, 2);
  assert.deepEqual(res.map((r) => r.text), ['b', 'c']);
});

test('buildPrompt numbers sources and includes pages', () => {
  const p = buildPrompt('What?', [{ text: 'one', page: 3 }, { text: 'two', page: null }]);
  assert.match(p, /\[1\] \(page 3\)\none/);
  assert.match(p, /\[2\]\ntwo/);
  assert.match(p, /Question: What\?/);
});
