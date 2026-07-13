import {doubleCsrf} from 'csrf-csrf';

const isProduction = process.env.NODE_ENV === 'production';

// Double-submit CSRF (maintained replacement for the deprecated csurf).
// Tokens are bound to the session id, so a token issued to one session is
// rejected for another — matching the old session-secret behaviour. The
// browser only ever talks to the Next.js origin (same-origin /api proxy), so
// the CSRF cookie stays first-party. Error code is kept as EBADCSRFTOKEN so
// AllExceptionsFilter maps it to a 403.
export const {generateCsrfToken, doubleCsrfProtection} = doubleCsrf({
  getSecret: () => process.env.SESSION_SECRET!,
  getSessionIdentifier: (req) => req.sessionID ?? '',
  // __Host- prefix requires secure + path=/; only valid over HTTPS (prod)
  cookieName: isProduction ? '__Host-ws.x-csrf-token' : 'ws.x-csrf-token',
  cookieOptions: {
    sameSite: isProduction ? 'strict' : 'lax',
    secure: isProduction,
    httpOnly: true,
    path: '/',
  },
  // Clients send the token in this header (see the ws-web axios interceptor)
  getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'],
  errorConfig: {
    statusCode: 403,
    message: 'Invalid CSRF token',
    code: 'EBADCSRFTOKEN',
  },
});
