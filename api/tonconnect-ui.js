export default async function handler(req, res) {
  try {
    // Берём UMD-бандл TonConnect UI (он как раз создаёт глобал в window)
    const upstream = await fetch(
      "https://cdn.jsdelivr.net/npm/@tonconnect/ui@0.2.0/dist/tonconnect-ui.min.js",
      { redirect: "follow" }
    );

    if (!upstream.ok) {
      res.status(upstream.status).send(`// TonConnect upstream error: ${upstream.status}`);
      return;
    }

    let js = await upstream.text();

    // Убираем sourcemap, чтобы не было 404 на *.map (и лишних предупреждений)
    js = js.replace(/\/\/# sourceMappingURL=.*$/gm, "");

    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    // Кэшируем надолго (быстро для всех юзеров)
    res.setHeader("Cache-Control", "public, max-age=86400");

    res.status(200).send(js);
  } catch (e) {
    res.status(500).send(`// TonConnect proxy failed: ${String(e)}`);
  }
}
