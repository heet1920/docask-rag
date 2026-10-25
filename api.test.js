// Exercises the serverless handlers with a mocked Gemini API.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import embed from '../api/embed.js';
import chat from '../api/chat.js';

function mockRes() {
  return {
    statusCode: 0, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

let calls;
beforeEach(() => {
  calls = [];
  process.env.GEMINI_API_KEY = 'test-key';
});

function mockFetch(status, payload) {
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return { ok: status < 400, status, json: async () => payload };
  };
}

test('embed rejects bad input', async () => {
  for (const body of [{}, { texts: [], taskType: 'RETRIEVAL_QUERY' }, { texts: ['x'], taskType: 'NOPE' }, { texts: [''], taskType: 'RETRIEVAL_QUERY' }]) {
    const res = mockRes();
    await embed({ method: 'POST', body }, res);
    assert.equal(res.statusCode, 400);
  }
});

test('embed returns vectors and sends key in header, not URL', async () => {
  mockFetch(200, { embeddings: [{ values: [0.1, 0.2] }, { values: [0.3, 0.4] }] });
  const res = mockRes();
  await embed({ method: 'POST', body: { texts: ['a', 'b'], taskType: 'RETRIEVAL_DOCUMENT' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.embeddings, [[0.1, 0.2], [0.3, 0.4]]);
  assert.ok(!calls[0].url.includes('test-key'));
  assert.equal(calls[0].init.headers['x-goog-api-key'], 'test-key');
  assert.equal(calls[0].body.requests[0].taskType, 'RETRIEVAL_DOCUMENT');
});

test('embed passes through rate-limit status', async () => {
  mockFetch(429, { error: { message: 'Quota exceeded' } });
  const res = mockRes();
  await embed({ method: 'POST', body: { texts: ['a'], taskType: 'RETRIEVAL_QUERY' } }, res);
  assert.equal(res.statusCode, 429);
});

test('chat builds grounded prompt and returns answer', async () => {
  mockFetch(200, { candidates: [{ content: { parts: [{ text: 'Three days [1].' }] } }] });
  const res = mockRes();
  await chat({ method: 'POST', body: { question: 'How many days?', sources: [{ text: 'Up to three days.', page: 1 }] } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.answer, 'Three days [1].');
  const prompt = calls[0].body.contents[0].parts[0].text;
  assert.match(prompt, /\[1\] \(page 1\)\nUp to three days\./);
});

test('chat rejects missing key, bad method and bad input', async () => {
  let res = mockRes();
  await chat({ method: 'GET' }, res);
  assert.equal(res.statusCode, 405);

  res = mockRes();
  await chat({ method: 'POST', body: { question: '', sources: [{ text: 'x' }] } }, res);
  assert.equal(res.statusCode, 400);

  res = mockRes();
  await chat({ method: 'POST', body: { question: 'q', sources: Array(7).fill({ text: 'x' }) } }, res);
  assert.equal(res.statusCode, 400);

  delete process.env.GEMINI_API_KEY;
  res = mockRes();
  await chat({ method: 'POST', body: { question: 'q', sources: [{ text: 'x' }] } }, res);
  assert.equal(res.statusCode, 500);
});
