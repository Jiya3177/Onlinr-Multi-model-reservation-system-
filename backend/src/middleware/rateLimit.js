const rateLimit = require('express-rate-limit');
const { isJsonRequest } = require('../utils/http');

function buildLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      if (isJsonRequest(req)) {
        return res.status(429).json({ ok: false, error: message });
      }

      if (req.session) {
        req.session.flash = { type: 'error', message };
      }

      const backTarget = req.get('Referrer') || '/';
      return res.status(429).redirect(backTarget);
    }
  });
}

const authLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many authentication attempts. Please wait a few minutes and try again.'
});

const paymentLimiter = buildLimiter({
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: 'Too many payment requests. Please wait a few minutes and try again.'
});

const suggestionLimiter = buildLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Too many search suggestion requests. Please slow down and try again.'
});

module.exports = {
  authLimiter,
  paymentLimiter,
  suggestionLimiter
};
