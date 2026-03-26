// api/auth/login.js
// Zmienne środowiskowe w Vercel:
//   GOOGLE_CLIENT_ID     — z Google Cloud Console
//   GOOGLE_CLIENT_SECRET — z Google Cloud Console
//   GOOGLE_REDIRECT_URI  — https://ksiegowoscai.vercel.app/api/auth/callback

module.exports = function handler(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'https://ksiegowoscai.vercel.app/api/auth/callback';

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ].join(' '),
    access_type: 'offline',  // żeby dostać refresh_token
    prompt: 'consent'        // zawsze pytaj o zgodę żeby dostać refresh_token
  });

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  res.redirect(googleAuthUrl);
};
