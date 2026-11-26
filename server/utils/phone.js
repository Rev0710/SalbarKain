const httpError = require('./httpError');

module.exports = function normalizePhilippinePhone(value) {
  if (typeof value !== 'string') {
    throw httpError(400, 'INVALID_PHONE', 'Enter a valid Philippine mobile number.');
  }

  const digits = value.replace(/\D/g, '');
  let normalized;
  if (/^09\d{9}$/.test(digits)) normalized = `+63${digits.slice(1)}`;
  else if (/^639\d{9}$/.test(digits)) normalized = `+${digits}`;
  else if (/^9\d{9}$/.test(digits)) normalized = `+63${digits}`;
  else throw httpError(400, 'INVALID_PHONE', 'Enter a valid Philippine mobile number.');

  return normalized;
};
