// POST /api/chat  { question: string, sources: [{ text, page? }] }
// Returns { answer: string }. The browser does retrieval; this route only generates.

import { buildPrompt } from '../lib.js';

const MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-flash-latest';
const MAX_QUESTION = 1000;
const MAX_SOURCES = 6;
const MAX_SOURCE_CHARS = 4000;

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

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: 'You answer questions about a document using only the provided context. Be concise and cite sources like [1].' }],
          },
          contents: [{ role: 'user', parts: [{ text: buildPrompt(question.trim(), clean) }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 800 },
        }),
      }
    );
    const data = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({ error: data?.error?.message || 'Generation request failed' });
    }
    const answer = (data.candidates?.[0]?.content?.parts || [])
      .map((p) => p.text || '')
      .join('')
      .trim();
    return res.status(200).json({ answer: answer || "The model didn't return an answer. Try rephrasing." });
  } catch (err) {
    return res.status(502).json({ error: 'Could not reach the Gemini API' });
  }
}
