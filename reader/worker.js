// Animal Sensei: Macha reads a child's handwritten Japanese answer and judges whether it makes sense.
// Step 1: a vision model writes down what the handwriting says.
// Step 2: a text model judges whether that answer can be understood and answers the question.
// Runs on Cloudflare Workers AI (free daily allowance). Nothing is stored here.

const ALLOWED = ["https://junyo1019.github.io"];
const VISION = {
  scout: "@cf/meta/llama-4-scout-17b-16e-instruct",
  gemma: "@cf/google/gemma-3-12b-it",
  mistral: "@cf/mistralai/mistral-small-3.1-24b-instruct",
  llama32: "@cf/meta/llama-3.2-11b-vision-instruct",
};
const JUDGE = "@cf/meta/llama-4-scout-17b-16e-instruct";

function cors(origin) {
  const ok = ALLOWED.includes(origin) || origin === "null";
  return {
    "Access-Control-Allow-Origin": ok ? origin : ALLOWED[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}
const json = (obj, status, origin) =>
  new Response(JSON.stringify(obj), { status: status || 200, headers: { "Content-Type": "application/json; charset=utf-8", ...cors(origin) } });

function textOf(r) {
  if (!r) return "";
  if (typeof r === "string") return r;
  if (typeof r.response === "string") return r.response;
  if (r.response && typeof r.response === "object") return JSON.stringify(r.response);
  if (r.choices && r.choices[0] && r.choices[0].message) return r.choices[0].message.content || "";
  return JSON.stringify(r);
}
function firstJSON(s) {
  const i = s.indexOf("{"), j = s.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(s.slice(i, j + 1)); } catch (e) { return null; }
}

async function transcribe(env, key, dataUrl) {
  const model = VISION[key] || VISION.scout;
  const prompt =
    "This image is a child's handwritten answer in Japanese (hiragana, katakana and/or kanji). " +
    "Write down exactly what it says, in Japanese characters only. Keep the child's mistakes; do not correct or add anything. " +
    "If a character is unclear, write your best guess. Reply with the Japanese text only, nothing else.";
  const messages = [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: dataUrl } }] }];
  const t0 = Date.now();
  let out;
  if (key === "llama32") {
    try { await env.AI.run(model, { prompt: "agree" }); } catch (e) {}   // one-time license acceptance for this model
    const bytes = Uint8Array.from(atob(dataUrl.split(",")[1]), (c) => c.charCodeAt(0));
    out = await env.AI.run(model, { prompt, image: [...bytes], max_tokens: 200 });
  } else {
    out = await env.AI.run(model, { messages, max_tokens: 200, temperature: 0 });
  }
  return { text: textOf(out).trim().replace(/^["'「]|["'」]$/g, ""), ms: Date.now() - t0, model };
}

async function judge(env, read, q, example, level) {
  const sys =
    "You check answers written by children aged 6 to 12 who grew up in the US and are learning Japanese. " +
    "You are kind but honest. Reply with JSON only.";
  const user =
    `Question (Japanese grade ${level}): ${q}\n` +
    `Example of a good answer: ${example}\n` +
    `What the child wrote (read from handwriting, so small reading errors are possible): ${read}\n\n` +
    "Decide only this: can a Japanese reader understand what the child means, and does it answer the question? " +
    "Hiragana instead of kanji, spelling slips and small grammar mistakes are fine when the meaning is clear. " +
    "Empty, unreadable, off-topic or nonsense answers are not ok.\n" +
    'Reply with only this JSON: {"ok": true or false, "praise": "one friendly sentence in simple English, max 12 words", ' +
    '"fix": "a natural corrected Japanese sentence if it needs fixing, otherwise empty string", "tip": "one short tip in simple English, max 14 words"}';
  const t0 = Date.now();
  const out = await env.AI.run(JUDGE, { messages: [{ role: "system", content: sys }, { role: "user", content: user }], max_tokens: 220, temperature: 0 });
  const j = firstJSON(textOf(out)) || {};
  return { ok: j.ok === true || j.ok === "true", praise: String(j.praise || ""), fix: String(j.fix || ""), tip: String(j.tip || ""), ms: Date.now() - t0 };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
    const url = new URL(request.url);
    if (request.method === "GET") return json({ ok: true, service: "Animal Sensei Macha reader" }, 200, origin);
    if (request.method !== "POST") return json({ error: "method" }, 405, origin);
    if (origin && !ALLOWED.includes(origin) && origin !== "null") return json({ error: "origin" }, 403, origin);

    let body;
    try { body = await request.json(); } catch (e) { return json({ error: "bad json" }, 400, origin); }
    const image = String(body.image || "");
    if (!/^data:image\/(png|jpeg);base64,/.test(image) || image.length > 1500000) return json({ error: "image" }, 400, origin);
    const q = String(body.q || "").slice(0, 300), example = String(body.example || "").slice(0, 300), level = Number(body.level) || 2;

    try {
      if (url.pathname === "/compare") {   // testing only: how each vision model reads the same handwriting
        const res = {};
        for (const k of Object.keys(VISION)) {
          try { res[k] = await transcribe(env, k, image); } catch (e) { res[k] = { error: String(e && e.message || e) }; }
        }
        return json(res, 200, origin);
      }
      const r = await transcribe(env, String(body.model || "scout"), image);
      if (!r.text) return json({ read: "", ok: false, praise: "", fix: "", tip: "Write a little bigger and clearer.", ms: r.ms }, 200, origin);
      const j = await judge(env, r.text, q, example, level);
      return json({ read: r.text, ok: j.ok, praise: j.praise, fix: j.fix, tip: j.tip, ms: r.ms + j.ms, model: r.model }, 200, origin);
    } catch (e) {
      return json({ error: "ai", detail: String(e && e.message || e) }, 502, origin);
    }
  },
};
