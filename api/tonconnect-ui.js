export default async function handler(req, res) {
  const sources = [
    "https://unpkg.com/@tonconnect/ui@2.0.9/dist/tonconnect-ui.min.js",
    "https://cdn.jsdelivr.net/npm/@tonconnect/ui@2.0.9/dist/tonconnect-ui.min.js",
  ];

  try {
    let lastStatus = 0;

    for (const url of sources) {
      const upstream = await fetch(url, { redirect: "follow" });
      lastStatus = upstream.status;

      if (upstream.ok) {
        let js = await upstream.text();

        // чтобы не было 404 на .map
        js = js.replace(/\/\/# sourceMappingURL=.*$/gm, "");

        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.status(200).send(js);
        return;
      }
    }

    res.status(502).send(`// TonConnect upstream error: ${lastStatus}`);
  } catch (e) {
    res.status(500).send(`// TonConnect proxy failed: ${String(e)}`);
  }
}
