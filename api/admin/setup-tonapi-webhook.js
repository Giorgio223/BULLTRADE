// api/admin/setup-tonapi-webhook.js
/**
 * One-time helper: creates a TONAPI webhook and subscribes your DEPOSIT wallet to account-tx updates.
 * Call manually: /api/admin/setup-tonapi-webhook?admin=YOUR_ADMIN_SECRET
 *
 * Requires:
 *  - TONAPI_KEY (private key from tonconsole)
 *  - WEBHOOK_ENDPOINT (full URL to your webhook, e.g. https://yourapp.vercel.app/api/webhook/ton?secret=...)
 *  - DEPOSIT_WALLET_ACCOUNT_ID (account_id in raw form like 0:....)  (NOT friendly address)
 *  - ADMIN_SECRET
 */
export default async function handler(req, res){
  const admin = req.query.admin;
  if(!process.env.ADMIN_SECRET || admin !== process.env.ADMIN_SECRET){
    return res.status(401).send('unauthorized');
  }

  const key = process.env.TONAPI_KEY;
  const endpoint = process.env.WEBHOOK_ENDPOINT;
  const accountId = process.env.DEPOSIT_WALLET_ACCOUNT_ID;

  if(!key || !endpoint || !accountId){
    return res.status(400).send('Missing TONAPI_KEY / WEBHOOK_ENDPOINT / DEPOSIT_WALLET_ACCOUNT_ID');
  }

  // 1) Create webhook
  const createResp = await fetch('https://rt.tonapi.io/webhooks', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ endpoint })
  });
  if(!createResp.ok){
    return res.status(502).send(await createResp.text());
  }
  const { webhook_id } = await createResp.json();

  // 2) Subscribe to account transactions
  const subResp = await fetch(`https://rt.tonapi.io/webhooks/${webhook_id}/account-tx/subscribe`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ accounts: [{ account_id: accountId }] })
  });
  if(!subResp.ok){
    return res.status(502).send(await subResp.text());
  }

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ ok: true, webhook_id });
}
