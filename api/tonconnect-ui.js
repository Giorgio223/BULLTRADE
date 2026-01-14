// api/tonconnect-ui.js
// Same-origin proxy for TonConnect UI to avoid Telegram in-app browsers blocking CDNs.

export default async function handler(req, res) {
  try {
    const sources = [
      "https://cdn.jsdelivr.net/npm/@tonconnect/ui@latest/dist/tonconnect-ui.min.js",
      "https://unpkg.com/@tonconnect/ui@latest/dist/tonconnect-ui.min.js"
    ];

    let lastErr = null;

    for (const url of sources) {
      try {
        const r = await fetch(url, {
          headers: { "User-Agent": "bulltrade-tonconnect-proxy" }
        });
        if (!r.ok) {
          lastErr = new Error(`Fetch failed ${r.status}`);
          continue;
        }

        const js = await r.text();
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400");
        return res.status(200).send(js);
      } catch (e) {
        lastErr = e;
      }
    }

    return res.status(502).send(`Proxy fetch failed: ${lastErr ? lastErr.message : "unknown"}`);
  } catch (e) {
    return res.status(500).send("Proxy error");
  }
}
