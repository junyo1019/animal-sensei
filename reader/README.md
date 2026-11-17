# Macha reader (Cloudflare Worker)

Source of the Worker `animal-sensei-macha` at https://animal-sensei-macha.junyo1019.workers.dev/

- Reads a child's handwritten Japanese answer (vision model: Llama 4 Scout on Cloudflare Workers AI) and judges whether the meaning is clear and answers the question.
- Binding: Workers AI as `AI`.
- Only accepts requests from https://junyo1019.github.io . Nothing is stored.
- Free plan: Workers AI includes a free daily allowance; when it runs out, requests fail until the next day (00:00 UTC) and the app falls back to "Saved".

To update: Cloudflare dashboard → Workers & Pages → animal-sensei-macha → Edit code, paste `worker.js`, Deploy.
