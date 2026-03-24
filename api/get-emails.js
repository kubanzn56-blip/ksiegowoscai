// api/get-emails.js
// Frontend odpytuje ten endpoint co 10 sekund

async function kvGet(key) {
  const res = await fetch(`${process.env.KV_REST_API_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
  });
  const data = await res.json();
  return data.result;
}

async function kvSet(key, value) {
  await fetch(`${process.env.KV_REST_API_URL}/set/${key}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(value)
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    // Pobierz listę ID maili
    const unreadRaw = await kvGet('unread_emails');
    let ids = [];
    try { ids = JSON.parse(unreadRaw || '[]'); } catch { ids = []; }

    if (ids.length === 0) return res.json({ emails: [] });

    // Pobierz dane każdego maila (max 20 najnowszych)
    const recent = ids.slice(0, 20);
    const emails = await Promise.all(
      recent.map(async id => {
        try {
          const raw = await kvGet(id);
          return raw ? JSON.parse(raw) : null;
        } catch { return null; }
      })
    );

    return res.json({ emails: emails.filter(Boolean) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};