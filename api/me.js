// api/me.js
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { address } = req.body || {};
    if (!address || typeof address !== 'string') {
      return res.status(400).send('address required');
    }

    // Create user record (custodial balance) keyed by TON address
    const key = `user:${address}:balance_nano`;
    const exists = await kv.get(key);
    if (exists === null) {
      await kv.set(key, '0'); // store as string
    }

    return res.status(200).json({ ok: true });
  }

  if (req.method === 'GET') {
    const address = req.query.address;
    if (!address) return res.status(400).send('address required');
    const bal = await kv.get(`user:${address}:balance_nano`);
    return res.status(200).json({ balanceNano: bal ? String(bal) : '0' });
  }

  res.status(405).send('Method not allowed');
}
