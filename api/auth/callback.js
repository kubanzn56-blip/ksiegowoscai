// api/auth/callback.js
// Google przekierowuje tutaj po zalogowaniu
// Zapisuje token do Vercel KV i przekierowuje do czatu

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

module.exports = async function handler(req, res) {
  const { code, error } = req.query;

  if (error) {
    return res.redirect('/chat-jpk.html?error=auth_denied');
  }

  if (!code) {
    return res.status(400).send('Brak kodu autoryzacji');
  }

  try {
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'https://ksiegowoscai.vercel.app/api/auth/callback';

    // Wymień code na access_token + refresh_token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    const tokens = await tokenRes.json();

    if (tokens.error) {
      console.error('Token error:', tokens);
      return res.redirect('/chat-jpk.html?error=token_failed');
    }

    // Pobierz dane użytkownika (email, nazwa)
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const user = await userRes.json();

    // Zapisz w KV — klucz to email biura
    const accountData = {
      email: user.email,
      name: user.name,
      picture: user.picture,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Date.now() + (tokens.expires_in * 1000),
      connected_at: new Date().toISOString()
    };

    await kvSet(`gmail_account_${user.email}`, JSON.stringify(accountData));

    // Przekieruj do czatu z emailem jako parametr
    res.redirect(`/chat-jpk.html?gmail=${encodeURIComponent(user.email)}&name=${encodeURIComponent(user.name)}`);

  } catch (err) {
    console.error('Auth callback error:', err);
    res.redirect('/chat-jpk.html?error=server_error');
  }
};
