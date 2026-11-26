const crypto = require('crypto');
const AuthLog = require('../models/AuthLog');

function hashIdentifier(value) {
  if (!value || typeof value !== 'string') return undefined;
  const key = process.env.AUTH_LOG_HMAC_SECRET || process.env.JWT_SECRET;
  if (!key || key.length < 32) return undefined;
  return crypto.createHmac('sha256', key).update(value.trim().toLowerCase().slice(0, 320)).digest('hex');
}

function recordAuthEvent(req, event, { email, userId, signals = [] } = {}) {
  const userAgent = req.get('user-agent') || '';
  const emailHash = hashIdentifier(email);
  const ipHash = hashIdentifier(req.ip);
  const userAgentHash = hashIdentifier(userAgent);
  return AuthLog.create({
    event,
    result: event === 'login_success' || event === 'register_success' ? 'success' : event === 'rate_limited' ? 'blocked' : event === 'suspicious_input' ? 'suspicious' : 'failure',
    ...(userId ? { userId } : {}),
    ...(emailHash ? { emailHash } : {}),
    ...(ipHash ? { ipHash } : {}),
    ...(userAgentHash ? { userAgentHash } : {}),
    route: `${req.baseUrl || ''}${req.path || ''}`.slice(0, 120),
    signals: [...new Set(signals)].slice(0, 12),
  }).catch((error) => {
    // Audit persistence is best-effort and must not make authentication unavailable.
    console.error('Unable to persist security audit event:', error.message);
  });
}

module.exports = { hashIdentifier, recordAuthEvent };
