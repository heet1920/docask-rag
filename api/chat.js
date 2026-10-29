// POST /api/chat  { question: string, sources: [{ text, page? }] }
// Returns { answer: string }. The browser does retrieval; this route only generates.

import { buildPrompt } from '../lib.js';

// Tried in order: if one model is overloaded, rate-limited or unavailable, fall back to the next.
const MODELS = (process.env.GEMINI_CHAT_MODEL || 'gemini-flash-latest,gemini-3.5-flash-lite,gemini-flash-lite-latest')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);
const RETRYABLE = new Set([404, 429, 500, 503]); // free-tier quotas are per model, so 429 can fall back too
const MODEL_TIMEOUT_MS = 20000; // give up on a slow model and try the next one
const MAX_QUESTION = 1000;
const MAX_SOURCES = 6;
const MAX_SOURCE_CHARS = 4000;

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'Server is missing GEMINI_API_KEY' });

  const { question, sources } = req.body || {};
  if (typeof question !== 'string' || !question.trim() || question.length > MAX_QUESTION) {
    return res.status(400).json({ error: `Question must be 1-${MAX_QUESTION} characters` });
  }
  if (!Array.isArray(sources) || sources.length === 0 || sources.length > MAX_SOURCES) {
    return res.status(400).json({ error: `Send between 1 and ${MAX_SOURCES} sources` });
  }
  const clean = sources.map((s) => ({
    text: typeof s?.text === 'string' ? s.text.slice(0, MAX_SOURCE_CHARS) : '',
    page: Number.isInteger(s?.page) ? s.page : null,
  }));
  if (clean.some((s) => !s.text)) return res.status(400).json({ error: 'Every source needs text' });

  const body = JSON.stringify({
    systemInstruction: {
      parts: [{ text: 'You answer questions about a document using only the provided context. Be concise and cite sources like [1].' }],
    },
    contents: [{ role: 'user', parts: [{ text: buildPrompt(question.trim(), clean) }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 4096 } // room for thinking tokens + the answer,
  });

  let last = { status: 502, error: 'Could not reach the Gemini API' };
  for (const model of MODELS) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body,
          signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
        }
      );
      const data = await r.json();
      if (r.ok) {
        const cand = data.candidates?.[0];
        let answer = (cand?.content?.parts || [])
          .filter((p) => !p.thought) // skip any thinking summaries
          .map((p) => p.text || '')
          .join('')
          .trim();
        if (answer && cand?.finishReason === 'MAX_TOKENS') {
          answer += '\n\n(Answer was cut off for length. Ask a narrower question for the rest.)';
        }
        return res.status(200).json({ answer: answer || "The model didn't return an answer. Try rephrasing.", model });
      }
      last = { status: r.status, error: data?.error?.message || 'Generation request failed' };
      console.warn(`[chat] ${model} failed (${r.status}): ${last.error}`);
      if (!RETRYABLE.has(r.status)) break; // e.g. 400 bad request: another model will not help
    } catch (err) {
      last = err?.name === 'TimeoutError'
        ? { status: 504, error: 'The AI took too long to answer. Please try again.' }
        : { status: 502, error: 'Could not reach the Gemini API' };
    }
  }
  const error = last.status === 503 ? 'All AI models are busy right now. Please try again in a minute.' : last.error;
  return res.status(last.status).json({ error });
}
