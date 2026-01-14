// /api/state.js (Vercel Serverless Function)
// Shared deterministic round state stored in Upstash Redis.
// All users see identical candles because chart is generated from:
// seed + cycleStartMs + tick index.

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
function mulberry32(a){
  return function(){
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rngForTick(seed, tick){
  const h = cyrb128(seed + ":" + String(tick));
  return mulberry32(h[0]);
}
function randn(rng){
  let u = 0, v = 0;
  while(u === 0) u = rng();
  while(v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function makeNextCandle(prevClose, tick, seed, volatility){
  const rng = rngForTick(seed, tick);
  const open = prevClose;
  const drift = randn(rng) * volatility;
  const close = open + drift;

  const body = Math.max(0.10, Math.abs(close - open));
  const longWick = rng() < 0.18;
  const wickMult = longWick ? (1.4 + rng()*0.9) : (0.35 + rng()*0.65);
  const cap = volatility * 2.2 + 0.8;
  const upWick = Math.min(cap, body * wickMult * (0.7 + rng()*0.8));
  const dnWick = Math.min(cap, body * wickMult * (0.7 + rng()*0.8));
  return { open, close, high: Math.max(open, close) + upWick, low: Math.min(open, close) - dnWick };
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
    .map(b=>b.toString(16).padStart(2,"0"))
    .join("");
}

function computeEndPrice(state){
  const ticks = Math.floor(state.runDurationMs / state.tickMs);
  let p = state.startPrice;
  for(let i=0;i<ticks;i++){
    const c = makeNextCandle(p, i, state.seed, state.volatility);
    p = c.close;
  }
  return p;
}

function rotateIfExpired(state, now){
  const countdownMs = state.betCountdownSec * 1000;
  const total = state.runDurationMs + countdownMs;
  const t = now - state.cycleStartMs;
  if(t < total) return state;

  // Continue smoothly: next round starts from deterministic end price
  const lastEnd = computeEndPrice(state);

  return {
    ...state,
    roundId: (state.roundId || 0) + 1,
    seed: newSeed(),
    cycleStartMs: now,
    startPrice: Math.round(lastEnd * 100) / 100
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
    try{ state = JSON.parse(raw); }catch(e){ state = null; }
  }

  if(!state){
    state = {
      roundId: 1,
      seed: newSeed(),
      cycleStartMs: now,
      tickMs: 500,
      runDurationMs: 30000,
      betCountdownSec: 7,
      volatility: 0.85,
      startPrice: 100
    };
  }else{
    state = rotateIfExpired(state, now);
  }

  await redisSet(UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, KEY, JSON.stringify(state));

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(state);
}
