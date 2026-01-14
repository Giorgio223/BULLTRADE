// api/webhook/ton.js
import { kv } from '@vercel/kv';

/**
 * TONAPI webhook handler.
 * Webhook payload example (docs):
 * {
 *   "account_id": "...",
 *   "lt": 49739623000001,
 *   "tx_hash": "..."
 * }
 * After receiving, we fetch tx details from TONAPI REST and credit matched invoices.
 */
export default async function handler(req, res) {
  // Simple shared secret to prevent random calls
  const secret = process.env.WEBHOOK_SECRET;
  if (secret && req.query.secret !== secret) {
    return res.status(401).send('unauthorized');
  }

  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const { account_id, lt, tx_hash } = req.body || {};
  if (!account_id || !tx_hash) return res.status(400).send('bad payload');

  // de-dupe
  const seenKey = `seen_tx:${tx_hash}`;
  const already = await kv.get(seenKey);
  if (already) return res.status(200).json({ ok: true, deduped: true });
  await kv.set(seenKey, '1', { ex: 60 * 60 * 24 * 7 }); // 7 days

  const tonapiKey = process.env.TONAPI_KEY;
  if (!tonapiKey) return res.status(500).send('TONAPI_KEY not set');

  // Fetch transaction details.
  // TONAPI provides endpoint /v2/blockchain/transactions/{transaction_id}
  // In practice tx_hash often works as transaction_id in their examples; adjust if needed.
  const url = `https://tonapi.io/v2/blockchain/transactions/${encodeURIComponent(tx_hash)}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${tonapiKey}` }
  });
  if (!resp.ok) {
    const t = await resp.text();
    return res.status(502).send(`tonapi fetch failed: ${t}`);
  }
  const tx = await resp.json();

  // Try to extract amount + comment from common TONAPI structures
  const extracted = extractIncoming(tx);
  if (!extracted) return res.status(200).json({ ok: true, ignored: true });

  const { amountNano, comment } = extracted;

  // Match invoices by comment "DEP:<invoiceId>"
  const m = /^DEP:([0-9a-f]{16})$/i.exec(comment || '');
  if (!m) return res.status(200).json({ ok: true, ignored: true });

  const invoiceId = m[1];
  const invKey = `invoice:${invoiceId}`;
  const inv = await kv.hgetall(invKey);
  if (!inv || !inv.address) return res.status(200).json({ ok: true, ignored: true });

  if (String(inv.credited) === '1') return res.status(200).json({ ok: true, alreadyCredited: true });

  const expected = BigInt(String(inv.amount_nano || '0'));
  const got = BigInt(String(amountNano || '0'));

  if (got < expected) {
    // Not enough — keep invoice uncredited, but store partial info
    await kv.hset(invKey, { last_seen_tx: tx_hash, last_seen_amount: got.toString() });
    return res.status(200).json({ ok: true, partial: true });
  }

  // Credit user
  const userAddr = String(inv.address);
  const balStr = await kv.get(`user:${userAddr}:balance_nano`);
  const bal = BigInt(balStr ? String(balStr) : '0');
  await kv.set(`user:${userAddr}:balance_nano`, (bal + got).toString());

  await kv.hset(invKey, { credited: '1', credited_at: String(Date.now()), tx_hash });

  return res.status(200).json({ ok: true, credited: true });
}

/**
 * Best-effort extractor for incoming TON transfer amount + comment.
 * Different providers format tx fields differently; adjust if your response differs.
 */
function extractIncoming(tx) {
  // Common patterns:
  // tx.in_msg.value / tx.in_msg.message
  // tx.in_msg.source
  // Or tx.transaction.in_msg...
  const inMsg =
    tx?.in_msg ||
    tx?.transaction?.in_msg ||
    tx?.data?.in_msg ||
    null;

  if (!inMsg) return null;

  const value = inMsg?.value ?? inMsg?.amount ?? null; // nanoTON string?
  const comment = inMsg?.message ?? inMsg?.comment ?? inMsg?.text ?? '';

  if (!value) return null;

  return { amountNano: String(value), comment: String(comment || '') };
}
