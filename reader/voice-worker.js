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
  a = Uint8Array.from(atob(r.audio), (x) => x.charCodeAt(0)).buffer;
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
      if (!t) return Response.json({ ok: 1 }, { headers: H });
      const a = await clip(e, t);
      if (u.pathname === "/check") {   // testing only: write down what the clip says, to check readings
        let s = ""; const b = new Uint8Array(a);
        for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768));
        const r = await e.AI.run("@cf/openai/whisper-large-v3-turbo", { audio: btoa(s), language: "ja" });
        return Response.json({ text: r.text, kb: Math.round(b.length / 1024) }, { headers: H });
      }
      return new Response(a, { headers: { ...H, "content-type": "audio/wav", "cache-control": "public, max-age=31536000, immutable" } });
    } catch (x) {
      return Response.json({ error: String((x && x.message) || x) }, { status: 502, headers: H });
    }
  },
};
