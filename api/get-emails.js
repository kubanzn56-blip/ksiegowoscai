// api/get-emails.js
async function kvGet(key) {
  const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` }
  });
  const data = await res.json();
  return data.result;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const raw = await kvGet('inbound_email_ids');
    let ids = [];
    try { ids = JSON.parse(raw || '[]'); } catch { ids = []; }

    if (ids.length === 0) return res.json({ emails: [] });

    const recent = ids.slice(0, 30);
    const emails = await Promise.all(
      recent.map(async id => {
        try {
          const r = await kvGet(id);
          return r ? JSON.parse(r) : null;
        } catch { return null; }
      })
    );

    return res.json({ emails: emails.filter(Boolean) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
