// api/withdraw/request.js
import crypto from "crypto";
import { kvGet, kvSet, kvHset, kvLpush } from "../_kv.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).send("Method not allowed");

    const { fromAddress, toAddress, amountTon } = req.body || {};
    if (!fromAddress || !toAddress) return res.status(400).send("fromAddress and toAddress required");

    const amt = Number(amountTon);
    if (!Number.isFinite(amt) || amt <= 0) return res.status(400).send("amountTon invalid");

    const amountNano = BigInt(Math.floor(amt * 1e9));

    const balStr = await kvGet(`user:${fromAddress}:balance_nano`);
    const bal = BigInt(balStr ? String(balStr) : "0");

    if (bal < amountNano) return res.status(400).send("Недостаточно средств");

    await kvSet(`user:${fromAddress}:balance_nano`, (bal - amountNano).toString());

    const reqId = crypto.randomBytes(10).toString("hex");
    await kvHset(`withdraw:${reqId}`, {
      from: fromAddress,
      to: toAddress,
      amount_nano: amountNano.toString(),
      status: "PENDING",
      created_at: String(Date.now()),
    });

    await kvLpush("withdraw_queue", reqId);
    return res.status(200).send(`ID: ${reqId} (ожидает обработки)`);
  } catch (e) {
    return res.status(500).send(String(e?.message || e));
  }
}
