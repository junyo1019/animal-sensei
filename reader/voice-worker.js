// Animal Sensei: Macha's story voice. Turns one Japanese sentence into natural speech (MeloTTS on Cloudflare Workers AI, MIT license).
// Only answers the Animal Sensei page. Audio for a sentence is kept in Cloudflare's cache, so repeats are instant.
const A = "https://junyo1019.github.io";
export default {
  async fetch(q, e, c) {
    const o = q.headers.get("Origin") || "", H = { "access-control-allow-origin": A, vary: "Origin" }, u = new URL(q.url);
    if (q.method === "OPTIONS") return new Response(null, { headers: { ...H, "access-control-allow-headers": "content-type" } });
    if (o !== A) return Response.json({ ok: 1, service: "Animal Sensei voice" }, { headers: H });
    try {
      if (u.pathname === "/asr") {   // testing only: write down what a clip says, to check readings
        const b = await q.json();
        const r = await e.AI.run("@cf/openai/whisper-large-v3-turbo", { audio: b.audio, language: "ja" });
        return Response.json({ text: r.text }, { headers: H });
      }
      const t = (u.searchParams.get("t") || "").slice(0, 400);
      if (!t) return Response.json({ ok: 1 }, { headers: H });
      const k = new Request(u.origin + "/c?t=" + encodeURIComponent(t));
      const hit = await caches.default.match(k);
      if (hit && !u.searchParams.get("j")) return hit;
      const r = await e.AI.run("@cf/myshell-ai/melotts", { prompt: t, lang: "jp" });
      if (u.searchParams.get("j")) return Response.json({ audio: r.audio }, { headers: H });
      const a = Uint8Array.from(atob(r.audio), (x) => x.charCodeAt(0));
      const res = new Response(a, { headers: { ...H, "content-type": "audio/wav", "cache-control": "public, max-age=31536000, immutable" } });
      c.waitUntil(caches.default.put(k, res.clone()));
      return res;
    } catch (x) {
      return Response.json({ error: String((x && x.message) || x) }, { status: 502, headers: H });
    }
  },
};
