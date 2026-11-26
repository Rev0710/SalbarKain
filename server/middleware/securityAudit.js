const { recordAuthEvent } = require('../utils/authAudit');

const SQL_PATTERN = /(?:\bunion\b\s+\bselect\b|\bor\b\s+['"]?\w+['"]?\s*=\s*['"]?\w+|;\s*(?:drop|alter|delete|insert|update)\b|--|\/\*)/i;
const XSS_PATTERN = /<\s*script\b|javascript\s*:|on(?:error|load|click)\s*=/i;

function scanValue(value, path, signals, depth = 0) {
  if (depth > 6 || signals.length >= 12) return;
  if (Array.isArray(value)) { value.slice(0, 30).forEach((item, index) => scanValue(item, `${path}[${index}]`, signals, depth + 1)); return; }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value).slice(0, 50)) {
      if (key.startsWith('$') || key.includes('.') || /^(?:__proto__|prototype|constructor)$/i.test(key)) signals.push('nosql_operator_or_path_key');
      scanValue(item, `${path}.${key}`, signals, depth + 1);
    }
    return;
  }
  // Credentials are never scanned, copied, or written to the audit collection.
  if (/password/i.test(path) || typeof value !== 'string') return;
  if (SQL_PATTERN.test(value)) signals.push('sql_injection_pattern');
  if (XSS_PATTERN.test(value)) signals.push('xss_markup_pattern');
}

function securityAudit(req, _res, next) {
  const signals = [];
  scanValue(req.body, 'body', signals);
  scanValue(req.query, 'query', signals);
  scanValue(req.params, 'params', signals);
  if (signals.length) return recordAuthEvent(req, 'suspicious_input', { email: req.body?.email, signals }).then(() => next());
  return next();
}

module.exports = securityAudit;
