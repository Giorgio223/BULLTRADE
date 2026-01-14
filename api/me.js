// api/me.js
import { kvGet, kvSet } from "./_kv.js";

export default async function handler(req, res) {
  try {
    if (req.method === "POST") {
      const { address } = req.body || {};
      if (!address || typeof address !== "string") return res.status(400).send("address required");

      const key = `user:${address}:balance_nano`;
      const exists = await kvGet(key);
      if (exists === null) await kvSet(key, "0");

      return res.status(200).json({ ok: true });
    }

    if (req.method === "GET") {
      const address = req.query.address;
      if (!address) return res.status(400).send("address required");
      const bal = await kvGet(`user:${address}:balance_nano`);
      return res.status(200).json({ balanceNano: bal ? String(bal) : "0" });
    }

    return res.status(405).send("Method not allowed");
  } catch (e) {
    return res.status(500).send(String(e?.message || e));
  }
}
