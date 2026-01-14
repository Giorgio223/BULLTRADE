// api/round.js
export default function handler(req, res) {
  // Настройки раунда — ДОЛЖНЫ совпадать с клиентом
  const runDurationMs = 30000;   // RUN длится 30с
  const tickMs = 500;            // тик 0.5с
  const betCountdownSec = 7;     // окно ставок 7с

  // Важно: SECRET положи в Vercel Environment Variables
  const SECRET = process.env.GAME_SECRET || "dev_secret_change_me";

  // Текущее серверное время
  const now = Date.now();

  // Полная длина цикла: RUN + COUNTDOWN(7с)
  const cycleMs = runDurationMs + betCountdownSec * 1000;

  // Идентификатор текущего цикла
  const roundId = Math.floor(now / cycleMs);

  // Начало цикла (округлённо)
  const roundStartMs = roundId * cycleMs;

  // Сколько прошло в цикле
  const elapsed = now - roundStartMs;

  // Фаза
  const phase = elapsed < runDurationMs ? "RUN" : "COUNTDOWN";

  // Детерминированный seed (из roundId + SECRET)
  const seed = hash32(`${roundId}:${SECRET}`);

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    serverNow: now,
    roundId,
    roundStartMs,
    phase,
    runDurationMs,
    tickMs,
    betCountdownSec,
    seed
  });
}

// Простой 32-bit hash (FNV-1a)
function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0; // unsigned
}
