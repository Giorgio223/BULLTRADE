// api/_kv.js
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

function needKV() {
  if (!KV_URL || !KV_TOKEN) {
    throw new Error("KV env missing: KV_REST_API_URL / KV_REST_API_TOKEN");
  }
}

async function kvFetch(path) {
  needKV();
  const r = await fetch(`${KV_URL}${path}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`KV REST error ${r.status}: ${t}`);
  }
  return r.json();
}

// GET key -> string|null
export async function kvGet(key) {
  const j = await kvFetch(`/get/${encodeURIComponent(key)}`);
  return j?.result ?? null;
}

// SET key value (string)
export async function kvSet(key, value) {
  await kvFetch(`/set/${encodeURIComponent(key)}/${encodeURIComponent(String(value))}`);
}

// HSET (object fields)
export async function kvHset(key, obj) {
  const args = [];
  for (const [k, v] of Object.entries(obj)) {
    args.push(k, String(v));
  }
  // /hset/<key>/<field>/<val>/<field>/<val>...
  const parts = ["/hset", encodeURIComponent(key), ...args.map(encodeURIComponent)];
  await kvFetch(parts.join("/"));
}

export async function kvHgetall(key) {
  const j = await kvFetch(`/hgetall/${encodeURIComponent(key)}`);
  // result is flat array [field,val,...] or object depending on provider
  const res = j?.result;
  if (!res) return null;
  if (Array.isArray(res)) {
    const out = {};
    for (let i = 0; i < res.length; i += 2) out[res[i]] = res[i + 1];
    return out;
  }
  if (typeof res === "object") return res;
  return null;
}

export async function kvLpush(key, value) {
  await kvFetch(`/lpush/${encodeURIComponent(key)}/${encodeURIComponent(String(value))}`);
}

export async function kvIncrby(key, by) {
  const j = await kvFetch(`/incrby/${encodeURIComponent(key)}/${encodeURIComponent(String(by))}`);
  return j?.result;
}
