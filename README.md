# DocAsk — RAG Document Q&A (docask-rag)

Upload a PDF, text or Markdown file and ask questions about it. Answers are grounded in the document and cite the exact passages they came from, with page numbers and similarity scores.

Runs entirely on free tiers: the **Gemini API** (no credit card) and **Vercel** hosting.

## How it works

```
Document (PDF / .txt / .md / pasted text)
   │  pdf.js extracts text per page, in the browser
   ▼
Chunking — ~900-char overlapping chunks, split on paragraph/sentence boundaries
   │
   ▼
/api/embed — gemini-embedding-001 (RETRIEVAL_DOCUMENT, 768 dims)
   │  vectors kept in browser memory; the document never touches a database
   ▼
Question → /api/embed (RETRIEVAL_QUERY) → cosine similarity → top-4 chunks
   │
   ▼
/api/chat — Gemini Flash answers from only those chunks and cites them as [1], [2]
```

- **Retrieval-augmented generation:** answers come from retrieved context, not the model's general knowledge. If the answer isn't in the document, the model says so.
- **API key stays server-side:** the browser only calls `/api/embed` and `/api/chat`, which are Vercel serverless functions holding `GEMINI_API_KEY`.
- **Input validation and rate-limit handling:** both routes cap input sizes, and free-tier 429s are shown as a friendly "wait a minute" message.
- **Tested:** 12 Node tests cover chunking, cosine similarity, top-k ranking, prompt building, and both API handlers against a mocked Gemini API.

## Project structure

| File | Purpose |
| --- | --- |
| `index.html` | The whole frontend: upload, indexing progress, chat with clickable citations |
| `lib.js` | Pure RAG helpers shared by browser and server: `chunkText`, `chunkPages`, `cosine`, `topK`, `buildPrompt` |
| `api/embed.js` | Serverless route that batches texts to Gemini embeddings |
| `api/chat.js` | Serverless route that builds the grounded prompt and calls Gemini Flash |
| `tests/` | `node --test` unit and API tests |

## Deploy from a browser (no terminal needed)

1. **Get a free Gemini key:** go to [aistudio.google.com](https://aistudio.google.com) → *Get API key* → *Create API key*. No credit card.
2. **Create the GitHub repo:** on github.com click *New repository*, name it `docask-rag`, make it public, create it. Click *uploading an existing file* and drag in every file and the `api` and `tests` folders from this project. Commit.
3. **Import into Vercel:** at [vercel.com/new](https://vercel.com/new), sign in with GitHub, pick the `docask-rag` repo. Leave the framework preset as *Other*.
4. **Add the key:** before clicking Deploy, open *Environment Variables* and add `GEMINI_API_KEY` = your key. Deploy.
5. Open the URL Vercel gives you, click **Try a sample**, and ask a question.

Optional environment variables:

- `GEMINI_CHAT_MODEL` — defaults to `gemini-flash-latest`. If Google retires that alias or it errors, set any current Flash model ID listed in AI Studio.
- `GEMINI_EMBED_MODEL` — defaults to `gemini-embedding-001`.

## Free-tier limits

The free Gemini tier rate-limits requests, so the app indexes at most 60 chunks (about 50,000 characters) per document. Free-tier usage is never billed. Anyone with your site link uses your key's quota, so share it with people you trust, or add rate limiting before posting it widely.

## Run the tests

```
npm test
```

(GitHub Codespaces works on a Chromebook if you want a terminal: open the repo → *Code* → *Codespaces* → *Create codespace*.)

## Possible next steps

- Persist vectors in **pgvector** on Neon so documents survive a page refresh
- Stream answers token-by-token
- Add an evaluation set of question/expected-source pairs and report retrieval hit rate
