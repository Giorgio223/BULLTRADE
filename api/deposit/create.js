// api/deposit/create.js
import crypto from "crypto";
import { kvHset } from "../_kv.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).send("Method not allowed");

    const { address, amountTon } = req.body || {};
    const depositAddress = process.env.DEPOSIT_WALLET_ADDRESS;
    if (!depositAddress) return res.status(500).send("DEPOSIT_WALLET_ADDRESS not set");

    if (!address || typeof address !== "string") return res.status(400).send("address required");

    const amt = Number(amountTon);
    if (!Number.isFinite(amt) || amt <= 0) return res.status(400).send("amountTon invalid");

    const amountNano = BigInt(Math.floor(amt * 1e9));
    const invoiceId = crypto.randomBytes(8).toString("hex");
    const comment = `DEP:${invoiceId}`;

    await kvHset(`invoice:${invoiceId}`, {
      address,
      amount_nano: amountNano.toString(),
      credited: "0",
      created_at: String(Date.now()),
    });

    const deeplink =
      `ton://transfer/${encodeURIComponent(depositAddress)}` +
      `?amount=${amountNano.toString()}&text=${encodeURIComponent(comment)}`;

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      invoiceId,
      depositAddress,
      comment,
      amountNano: amountNano.toString(),
      deeplink,
    });
  } catch (e) {
    return res.status(500).send(String(e?.message || e));
  }
}
