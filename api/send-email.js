// api/send-email.js
// Dodaj w Vercel: Settings → Environment Variables → BREVO_API_KEY

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Brak BREVO_API_KEY w zmiennych środowiskowych' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch(e) {}
  }
  if (!body) {
    body = await new Promise((resolve) => {
      let data = '';
      req.on('data', chunk => data += chunk);
      req.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({}); } });
    });
  }

  const { to, toName, subject, htmlContent, textContent } = body;

  if (!to || !subject || !htmlContent) {
    return res.status(400).json({ error: 'Brak wymaganych pól: to, subject, htmlContent' });
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify({
        sender: {
          name: 'Biuro Rachunkowe',
          email: process.env.BREVO_SENDER_EMAIL || 'noreply@ksiegowoscai.pl'
        },
        to: [{ email: to, name: toName || to }],
        subject,
        htmlContent,
        textContent: textContent || htmlContent.replace(/<[^>]+>/g, '')
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.message || 'Błąd Brevo' });
    }

    return res.status(200).json({ success: true, messageId: data.messageId });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};