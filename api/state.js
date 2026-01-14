// /api/state.js (Vercel Serverless Function)
// Shared deterministic round state stored in Upstash Redis.
// Adds targetPrice: the client chart moves toward this number during RUN.

const KEY = "bt:current";

function cyrb128(str){
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for(let i=0, k; i<str.length; i++){
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1^h2^h3^h4)>>>0, (h2^h1)>>>0, (h3^h1)>>>0, (h4^h1)>>>0];
}

async function redisGet(url, token, key){
  const r = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const j = await r.json();
  return j?.result ?? null;
}

async function redisSet(url, token, key, value){
  const r = await fetch(`${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return r.json();
}

function newSeed(){
  // 32 hex chars
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// Deterministic target from seed so everyone has the same target for the round.
function makeTargetPrice(startPrice, seed){
  const h = cyrb128(seed)[0];
  const r = (h % 1000) / 1000;        // 0..0.999
  const dir = (h % 2 === 0) ? 1 : -1; // UP/DOWN
  const delta = 1 + r * 6;            // 1..7
  return Math.round((startPrice + dir * delta) * 100) / 100;
}

// Since client is designed to land exactly on targetPrice, we can treat endPrice as targetPrice.
function computeEndPrice(state){
  const t = Number(state.targetPrice ?? state.startPrice);
  return Math.round(t * 100) / 100;
}

function rotateIfExpired(state, now){
  const countdownMs = state.betCountdownSec * 1000;
  const totalMs = state.runDurationMs + countdownMs;
  const elapsed = now - state.cycleStartMs;
  if(elapsed < totalMs) return state;

  const lastEnd = computeEndPrice(state);
  const nextSeed = newSeed();
  const nextStart = Math.round(lastEnd * 100) / 100;

  return {
    ...state,
    roundId: (state.roundId || 0) + 1,
    seed: nextSeed,
    cycleStartMs: now,
    startPrice: nextStart,
    targetPrice: makeTargetPrice(nextStart, nextSeed)
  };
}

export default async function handler(req, res){
  const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
  const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

  if(!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN){
    res.status(500).json({
      error: "Missing Upstash env vars. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Vercel."
    });
    return;
  }

  const now = Date.now();

  let raw = await redisGet(UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, KEY);
  let state = null;

  if(raw){
    try { state = JSON.parse(raw); } catch(e) { state = null; }
  }

  if(!state){
    const seed = newSeed();
    state = {
      roundId: 1,
      seed,
      cycleStartMs: now,
      tickMs: 500,
      runDurationMs: 30000,
      betCountdownSec: 7,
      volatility: 0.85,
      startPrice: 100,
      targetPrice: makeTargetPrice(100, seed)
    };
  }else{
    // Backward compatibility: ensure targetPrice exists
    if(state.targetPrice == null){
      const sp = Number(state.startPrice ?? 100);
      const sd = String(state.seed || newSeed());
      state.targetPrice = makeTargetPrice(sp, sd);
    }
    state = rotateIfExpired(state, now);
  }

  // Persist state (and rotation if happened)
  await redisSet(UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, KEY, JSON.stringify(state));

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(state);
}
