// Animal Sensei: Macha's story voice. Turns one Japanese sentence into natural speech (MeloTTS on Cloudflare Workers AI, MIT license).
// Each sentence is made once and then kept in Workers KV (binding AUDIO), so every later play is instant.
// Bindings: AI (Workers AI), AUDIO (KV namespace animal-sensei-audio). Only answers the Animal Sensei page.
const A = "https://junyo1019.github.io";
async function key(t) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function clip(e, t) {
  const k = await key(t);
  let a = await e.AUDIO.get(k, { type: "arrayBuffer" });
  if (a) return a;
  const r = await e.AI.run("@cf/myshell-ai/melotts", { prompt: t, lang: "jp" });
  // native base64 decoding: a JavaScript loop over a 1 MB clip runs past the free plan's CPU limit
  a = (Uint8Array.fromBase64 ? Uint8Array.fromBase64(r.audio) : Uint8Array.from(atob(r.audio), (x) => x.charCodeAt(0))).buffer;
  await e.AUDIO.put(k, a);
  return a;
}
export default {
  async fetch(q, e) {
    const o = q.headers.get("Origin") || "", H = { "access-control-allow-origin": A, vary: "Origin" }, u = new URL(q.url);
    if (q.method === "OPTIONS") return new Response(null, { headers: H });
    if (o !== A) return Response.json({ ok: 1, service: "Animal Sensei voice" }, { headers: H });
    try {
      const t = (u.searchParams.get("t") || "").slice(0, 400);
      if (!t) return Response.json({ ok: 1, native: !!Uint8Array.fromBase64 }, { headers: H });
      const a = await clip(e, t);
      if (u.pathname === "/check") {   // testing only: write down what the clip says, to check readings
        const b = new Uint8Array(a); let s = "";
        if (b.toBase64) s = b.toBase64(); else { let x = ""; for (let i = 0; i < b.length; i += 32768) x += String.fromCharCode.apply(null, b.subarray(i, i + 32768)); s = btoa(x); }
        const r = await e.AI.run("@cf/openai/whisper-large-v3-turbo", { audio: s, language: "ja" });
        return Response.json({ text: r.text, kb: Math.round(b.length / 1024) }, { headers: H });
      }
      return new Response(a, { headers: { ...H, "content-type": "audio/wav", "cache-control": "public, max-age=31536000, immutable" } });
    } catch (x) {
      return Response.json({ error: String((x && x.message) || x) }, { status: 502, headers: H });
    }
  },
};
