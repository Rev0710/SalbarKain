const jwt = require('jsonwebtoken');
const httpError = require('./httpError');

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32 || secret === 'replace-with-a-long-random-secret') {
    throw httpError(500, 'AUTH_NOT_CONFIGURED', 'Authentication is not configured on this server.');
  }
  return secret;
}

function assertJwtConfigured() {
  getSecret();
}

function signAccessToken(user) {
  return jwt.sign(
    { role: user.role },
    getSecret(),
    {
      subject: user._id.toString(),
      issuer: 'salbar-kain',
      audience: 'salbar-kain-client',
      expiresIn: '7d',
    },
  );
}

module.exports = { signAccessToken, assertJwtConfigured };
