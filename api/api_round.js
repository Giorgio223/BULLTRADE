// api/round.js
export default function handler(req, res) {
  // Must match client
  const runDurationMs = 30000;
  const tickMs = 500;
  const betCountdownSec = 7;

  const SECRET = process.env.GAME_SECRET || "dev_secret_change_me";

  const now = Date.now();
  const cycleMs = runDurationMs + betCountdownSec * 1000;
  const roundId = Math.floor(now / cycleMs);
  const roundStartMs = roundId * cycleMs;
  const elapsed = now - roundStartMs;
  const phase = elapsed < runDurationMs ? "RUN" : "COUNTDOWN";

  // Provide seeds for last 10 finished + current (11 total)
  const seeds = [];
  for (let i = roundId - 10; i <= roundId; i++) {
    seeds.push({ roundId: i, seed: hash32(`${i}:${SECRET}`) });
  }

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    serverNow: now,
    roundId,
    roundStartMs,
    phase,
    runDurationMs,
    tickMs,
    betCountdownSec,
    seeds
  });
}

function hash32(str) {
  // FNV-1a 32-bit
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
