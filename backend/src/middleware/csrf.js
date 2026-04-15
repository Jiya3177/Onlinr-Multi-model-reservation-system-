const crypto = require('crypto');

function ensureCsrfToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }

  return req.session.csrfToken;
}

function exposeCsrfToken(req, res, next) {
  res.locals.csrfToken = ensureCsrfToken(req);
  next();
}

function tokensMatch(expected, received) {
  if (!expected || !received) return false;

  const expectedBuffer = Buffer.from(String(expected));
  const receivedBuffer = Buffer.from(String(received));

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function requireCsrf(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }

  const token = req.body?._csrf || req.get('x-csrf-token');
  const expectedToken = ensureCsrfToken(req);

  if (!tokensMatch(expectedToken, token)) {
    const error = new Error('Invalid CSRF token.');
    error.status = 403;
    return next(error);
  }

  next();
}

module.exports = {
  exposeCsrfToken,
  requireCsrf
};
