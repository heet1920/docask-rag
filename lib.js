// Core RAG helpers shared by the browser (index.html) and the serverless API.
// Pure functions only, so they can be unit-tested with `node --test`.

/**
 * Split text into overlapping chunks, preferring paragraph/sentence boundaries.
 */
export function chunkText(text, { size = 900, overlap = 150 } = {}) {
  const clean = String(text || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!clean) return [];

  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      const win = clean.slice(start, end);
      const breakAt = Math.max(win.lastIndexOf('\n\n'), win.lastIndexOf('. '), win.lastIndexOf('\n'));
      if (breakAt > size * 0.5) end = start + breakAt + 1;
    }
    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= clean.length) break;

    // Step back by `overlap`, snapping to the next word boundary.
    const back = end - overlap;
    const space = clean.indexOf(' ', back);
    start = space > back && space < end ? space + 1 : back;
  }
  return chunks;
}

/**
 * Chunk a list of pages ([{ page, text }]) and keep the page number on every chunk.
 */
export function chunkPages(pages, opts) {
  const out = [];
  for (const { page, text } of pages) {
    for (const piece of chunkText(text, opts)) {
      out.push({ id: out.length + 1, page, text: piece });
    }
  }
  return out;
}

export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

/**
 * Return the k items (each with a `vector`) most similar to the query vector.
 */
export function topK(queryVec, items, k = 4) {
  return items
    .map((item) => ({ ...item, score: cosine(queryVec, item.vector) }))
    .sort((x, y) => y.score - x.score)
    .slice(0, k);
}

/**
 * Build the grounded prompt sent to the LLM. Sources are numbered [1], [2], ...
 */
export function buildPrompt(question, sources) {
  const context = sources
    .map((s, i) => `[${i + 1}]${s.page ? ` (page ${s.page})` : ''}\n${s.text}`)
    .join('\n\n');
  return (
    `Context from the user's document:\n\n${context}\n\n` +
    `Question: ${question}\n\n` +
    `Answer using only the context above. Cite sources inline like [1] or [2]. ` +
    `If the answer is not in the context, say you couldn't find it in the document.`
  );
}
