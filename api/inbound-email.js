// api/inbound-email.js
// Zmienne środowiskowe w Vercel:
//   KV_REST_API_URL     — z Vercel Storage → KV → dashboard
//   KV_REST_API_TOKEN   — j.w.
//   INBOUND_SECRET      — ten sam co w Cloudflare Worker

async function kvRequest(method, path, body) {
  const url = `${process.env.KV_REST_API_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') return res.status(405).end();

  let body = req.body;
  if (!body) {
    body = await new Promise(resolve => {
      let data = '';
      req.on('data', c => data += c);
      req.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    });
  }

  // Weryfikacja sekretu
  if (body.secret !== process.env.INBOUND_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { from, to, subject, body: emailBody, receivedAt } = body;

  // Generuj ID maila
  const id = `email_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const email = {
    id,
    from,
    to,
    subject,
    body: emailBody,
    receivedAt,
    read: false,
    aiDraft: null
  };

  // Zapisz email do KV
  await kvRequest('POST', `/set/${id}`, email);

  // Dodaj ID do listy nieprzeczytanych
  const unreadRes = await kvRequest('GET', '/get/unread_emails').catch(() => null);
  let unread = [];
  try { unread = JSON.parse(unreadRes?.result || '[]'); } catch { unread = []; }
  unread.unshift(id);
  // Trzymaj max 200 maili
  if (unread.length > 200) unread = unread.slice(0, 200);
  await kvRequest('POST', '/set/unread_emails', unread);

  return res.status(200).json({ success: true, id });
};