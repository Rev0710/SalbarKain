const { rateLimit } = require('express-rate-limit');
const { recordAuthEvent } = require('../utils/authAudit');

function makeLimiter(limit, code, message) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    async handler(req, res) {
      if (code === 'AUTH_RATE_LIMITED') await recordAuthEvent(req, 'rate_limited', { email: typeof req.body?.email === 'string' ? req.body.email : undefined });
      res.status(429).json({ success: false, code, message });
    },
  });
}

module.exports = {
  authLimiter: makeLimiter(Number(process.env.AUTH_RATE_LIMIT) || 10, 'AUTH_RATE_LIMITED', 'Too many sign-in attempts. Try again in 15 minutes.'),
  claimLimiter: makeLimiter(Number(process.env.CLAIM_RATE_LIMIT) || 5, 'CLAIM_RATE_LIMITED', 'Too many claim attempts. Try again in 15 minutes.'),
};
