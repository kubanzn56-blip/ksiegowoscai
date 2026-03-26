// api/auth/emails.js
// Pobiera nowe maile ze skrzynki Gmail biura rachunkowego
// Wywołaj: GET /api/auth/emails?account=biuro@gmail.com

async function kvGet(key) {
  const res = await fetch(`${process.env.KV_REST_API_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
  });
  const data = await res.json();
  return data.result;
}

async function kvSet(key, value) {
  const res = await fetch(`${process.env.KV_REST_API_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(value)
  });
  return res.json();
}

async function refreshAccessToken(account) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: account.refresh_token,
      grant_type: 'refresh_token'
    })
  });
  const tokens = await res.json();
  if (tokens.error) throw new Error('Nie udało się odświeżyć tokenu');

  account.access_token = tokens.access_token;
  account.expires_at = Date.now() + (tokens.expires_in * 1000);
  await kvSet(`gmail_account_${account.email}`, JSON.stringify(account));
  return account;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const accountEmail = req.query.account;
  if (!accountEmail) return res.status(400).json({ error: 'Brak parametru account' });

  try {
    // Pobierz dane konta z KV
    const raw = await kvGet(`gmail_account_${accountEmail}`);
    if (!raw) return res.status(404).json({ error: 'Konto nie podłączone. Zaloguj się przez Gmail.' });

    let account = JSON.parse(raw);

    // Odśwież token jeśli wygasł
    if (Date.now() >= account.expires_at - 60000) {
      account = await refreshAccessToken(account);
    }

    // Pobierz ostatnie 20 maili z inbox
    const listRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&labelIds=INBOX&q=is:unread',
      { headers: { Authorization: `Bearer ${account.access_token}` } }
    );
    const listData = await listRes.json();

    if (!listData.messages || listData.messages.length === 0) {
      return res.json({ emails: [] });
    }

    // Pobierz szczegóły każdego maila
    const emails = await Promise.all(
      listData.messages.slice(0, 20).map(async msg => {
        try {
          const msgRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
            { headers: { Authorization: `Bearer ${account.access_token}` } }
          );
          const msgData = await msgRes.json();

          const headers = msgData.payload?.headers || [];
          const getHeader = name => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

          const from = getHeader('From');
          const subject = getHeader('Subject') || '(bez tematu)';
          const date = getHeader('Date');

          // Wyciągnij treść
          let body = '';
          const parts = msgData.payload?.parts || [msgData.payload];
          for (const part of parts) {
            if (part?.mimeType === 'text/plain' && part?.body?.data) {
              body = Buffer.from(part.body.data, 'base64').toString('utf-8');
              break;
            }
          }
          if (!body && msgData.payload?.body?.data) {
            body = Buffer.from(msgData.payload.body.data, 'base64').toString('utf-8');
          }

          // Wyciągnij email z "Imię <email@gmail.com>"
          const fromEmailMatch = from.match(/<([^>]+)>/) || [null, from];
          const fromEmail = fromEmailMatch[1] || from;
          const fromName = from.replace(/<[^>]+>/, '').trim().replace(/"/g, '') || fromEmail;

          return {
            id: `gmail_${msg.id}`,
            gmailId: msg.id,
            from: fromEmail,
            fromName,
            subject,
            body: body.slice(0, 5000),
            receivedAt: date || new Date().toISOString(),
            read: false,
            source: 'gmail'
          };
        } catch { return null; }
      })
    );

    return res.json({ emails: emails.filter(Boolean), account: { email: account.email, name: account.name } });

  } catch (err) {
    console.error('Gmail fetch error:', err);
    return res.status(500).json({ error: err.message });
  }
};
