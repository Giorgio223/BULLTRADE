// api/withdraw/request.js
import { kv } from '@vercel/kv';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const { fromAddress, toAddress, amountTon } = req.body || {};
  if (!fromAddress || !toAddress) return res.status(400).send('fromAddress and toAddress required');

  const amt = Number(amountTon);
  if (!Number.isFinite(amt) || amt <= 0) return res.status(400).send('amountTon invalid');

  const amountNano = BigInt(Math.floor(amt * 1e9));

  // check balance
  const balStr = await kv.get(`user:${fromAddress}:balance_nano`);
  const bal = BigInt(balStr ? String(balStr) : '0');
  if (bal < amountNano) return res.status(400).send('Недостаточно средств');

  // lock funds (simple: subtract immediately; alternatively mark as pending)
  await kv.set(`user:${fromAddress}:balance_nano`, (bal - amountNano).toString());

  const reqId = crypto.randomBytes(10).toString('hex');
  await kv.hset(`withdraw:${reqId}`, {
    from: fromAddress,
    to: toAddress,
    amount_nano: amountNano.toString(),
    status: 'PENDING',
    created_at: String(Date.now())
  });
  // queue list
  await kv.lpush('withdraw_queue', reqId);

  res.status(200).send(`ID: ${reqId} (ожидает обработки)`);
}
