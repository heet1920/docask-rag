// POST /api/embed  { texts: string[], taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" }
// Returns { embeddings: number[][] }. Keeps the Gemini API key on the server.

const MODEL = process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001';
const TASK_TYPES = new Set(['RETRIEVAL_DOCUMENT', 'RETRIEVAL_QUERY']);
const MAX_TEXTS = 20;
const MAX_CHARS = 4000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'Server is missing GEMINI_API_KEY' });

  const { texts, taskType } = req.body || {};
  if (!Array.isArray(texts) || texts.length === 0 || texts.length > MAX_TEXTS) {
    return res.status(400).json({ error: `Send between 1 and ${MAX_TEXTS} texts` });
  }
  if (!texts.every((t) => typeof t === 'string' && t.length > 0 && t.length <= MAX_CHARS)) {
    return res.status(400).json({ error: `Each text must be 1-${MAX_CHARS} characters` });
  }
  if (!TASK_TYPES.has(taskType)) return res.status(400).json({ error: 'Invalid taskType' });

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          requests: texts.map((text) => ({
            model: `models/${MODEL}`,
            content: { parts: [{ text }] },
            taskType,
            outputDimensionality: 768,
          })),
        }),
      }
    );
    const data = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({ error: data?.error?.message || 'Embedding request failed' });
    }
    return res.status(200).json({ embeddings: data.embeddings.map((e) => e.values) });
  } catch (err) {
    return res.status(502).json({ error: 'Could not reach the Gemini API' });
  }
}
