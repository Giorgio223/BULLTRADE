// api/webhook/ton.js
import { kvGet, kvSet, kvHgetall, kvHset, kvIncrby } from "../_kv.js";

export default async function handler(req, res) {
  try {
    const secret = process.env.WEBHOOK_SECRET;
    if (secret && req.query.secret !== secret) return res.status(401).send("unauthorized");

    if (req.method !== "POST") return res.status(405).send("Method not allowed");

    const { tx_hash } = req.body || {};
    if (!tx_hash) return res.status(400).send("bad payload");

    // dedupe
    const seenKey = `seen_tx:${tx_hash}`;
    const already = await kvGet(seenKey);
    if (already) return res.status(200).json({ ok: true, deduped: true });
    await kvSet(seenKey, "1");

    const tonapiKey = process.env.TONAPI_KEY;
    if (!tonapiKey) return res.status(500).send("TONAPI_KEY not set");

    const url = `https://tonapi.io/v2/blockchain/transactions/${encodeURIComponent(tx_hash)}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${tonapiKey}` } });
    if (!r.ok) return res.status(502).send(await r.text());
    const tx = await r.json();

    const extracted = extractIncoming(tx);
    if (!extracted) return res.status(200).json({ ok: true, ignored: true });

    const { amountNano, comment } = extracted;
    const m = /^DEP:([0-9a-f]{16})$/i.exec(comment || "");
    if (!m) return res.status(200).json({ ok: true, ignored: true });

    const invoiceId = m[1];
    const invKey = `invoice:${invoiceId}`;
    const inv = await kvHgetall(invKey);
    if (!inv || !inv.address) return res.status(200).json({ ok: true, ignored: true });

    if (String(inv.credited) === "1") return res.status(200).json({ ok: true, alreadyCredited: true });

    const expected = BigInt(String(inv.amount_nano || "0"));
    const got = BigInt(String(amountNano || "0"));
    if (got < expected) {
      await kvHset(invKey, { last_seen_tx: tx_hash, last_seen_amount: got.toString() });
      return res.status(200).json({ ok: true, partial: true });
    }

    const userAddr = String(inv.address);
    await kvIncrby(`user:${userAddr}:balance_nano`, got.toString());

    await kvHset(invKey, { credited: "1", credited_at: String(Date.now()), tx_hash });

    return res.status(200).json({ ok: true, credited: true });
  } catch (e) {
    return res.status(500).send(String(e?.message || e));
  }
}

function extractIncoming(tx) {
  const inMsg = tx?.in_msg || tx?.transaction?.in_msg || tx?.data?.in_msg || null;
  if (!inMsg) return null;

  const value = inMsg?.value ?? inMsg?.amount ?? null;
  const comment = inMsg?.message ?? inMsg?.comment ?? inMsg?.text ?? "";
  if (!value) return null;

  return { amountNano: String(value), comment: String(comment || "") };
}
