// api/inbound-email.js — Cloudmailin Multipart Normalized format
// Zmienne środowiskowe w Vercel:
//   KV_REST_API_URL   — z Vercel Storage → KV
//   KV_REST_API_TOKEN — j.w.

async function kvSet(key, value) {
  const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(value)
  });
  return res.json();
}

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
  if (req.method !== 'POST') return res.status(405).end();

  // Cloudmailin wysyła multipart/form-data lub JSON
  // Vercel automatycznie parsuje JSON, dla multipart musimy wyciągnąć z body
  let body = req.body;
  if (!body) {
    body = await new Promise(resolve => {
      let data = '';
      req.on('data', c => data += c);
      req.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch {
          // Spróbuj jako URL-encoded
          const params = new URLSearchParams(data);
          const obj = {};
          for (const [k, v] of params) obj[k] = v;
          resolve(obj);
        }
      });
    });
  }

  // Cloudmailin Multipart Normalized format
  // headers: { from, to, subject, ... }
  // plain: tekst wiadomości
  // html: wersja HTML
  const headers = body.headers || {};
  const from = headers.from || body.from || '';
  const to = headers.to || body.to || '';
  const subject = headers.subject || body.subject || '(bez tematu)';
  const plain = body.plain || body.body || '';
  const html = body.html || '';

  // Wyciągnij email z "Imię Nazwisko <email@domena.pl>"
  const fromEmailMatch = from.match(/<([^>]+)>/) || [null, from];
  const fromEmail = fromEmailMatch[1] || from;
  const fromName = from.replace(/<[^>]+>/, '').trim().replace(/"/g, '') || fromEmail;

  if (!fromEmail) return res.status(400).json({ error: 'Brak nadawcy' });

  const emailText = (plain || html.replace(/<[^>]+>/g, '')).slice(0, 5000);

  const email = {
    id: `email_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    from: fromEmail,
    fromName,
    to,
    subject,
    body: emailText,
    receivedAt: new Date().toISOString(),
    read: false
  };

  // Zapisz email w KV
  await kvSet(email.id, JSON.stringify(email));

  // Dodaj do listy ID
  let ids = [];
  try {
    const raw = await kvGet('inbound_email_ids');
    ids = JSON.parse(raw || '[]');
  } catch { ids = []; }
  ids.unshift(email.id);
  if (ids.length > 200) ids = ids.slice(0, 200);
  await kvSet('inbound_email_ids', JSON.stringify(ids));

  console.log(`📬 Nowy mail od ${fromEmail}: ${subject}`);

  // Cloudmailin wymaga 200 żeby wiedzieć że odebraliśmy
  return res.status(200).json({ success: true, id: email.id });
};
