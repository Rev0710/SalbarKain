const jwt = require('jsonwebtoken');
const User = require('../models/User');
const httpError = require('../utils/httpError');

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32 || secret === 'replace-with-a-long-random-secret') {
    throw httpError(500, 'AUTH_NOT_CONFIGURED', 'Authentication is not configured on this server.');
  }
  return secret;
}

function authenticate(req, _res, next) {
  const header = req.get('authorization') || '';
  const match = /^Bearer\s+([^\s]+)$/i.exec(header);
  if (!match) return next(httpError(401, 'AUTH_REQUIRED', 'Sign in to continue.'));

  let payload;
  try {
    payload = jwt.verify(match[1], getSecret(), {
      issuer: 'salbar-kain',
      audience: 'salbar-kain-client',
    });
  } catch (error) {
    if (error.statusCode) return next(error);
    return next(httpError(401, 'INVALID_TOKEN', 'Your session is invalid. Sign in again.'));
  }

  if (typeof payload.sub !== 'string' || !['merchant', 'ngo', 'admin'].includes(payload.role)) {
    return next(httpError(401, 'INVALID_TOKEN', 'Your session is invalid. Sign in again.'));
  }

  User.findById(payload.sub)
    .select('role name email storeName organizationName verified verificationStatus storefrontPhotoUrl barangay municipality')
    .lean()
    .then((user) => {
      if (!user || user.role !== payload.role) {
        return next(httpError(401, 'INVALID_TOKEN', 'Your session is invalid. Sign in again.'));
      }
      req.user = {
        id: user._id.toString(),
        role: user.role,
        name: user.name,
        email: user.email,
        storeName: user.storeName,
        organizationName: user.organizationName,
        verified: user.verificationStatus === 'verified' || user.verified === true,
        verificationStatus: user.verified ? 'verified' : (user.verificationStatus || 'pending'),
        storefrontPhotoUrl: user.storefrontPhotoUrl,
        barangay: user.barangay || 'Unspecified',
        municipality: user.municipality || 'Unspecified',
      };
      return next();
    })
    .catch(next);
}

function requireVerified(req, _res, next) {
  if (!req.user || !(req.user.verificationStatus === 'verified' || req.user.verified)) {
    return next(httpError(403, 'VERIFICATION_REQUIRED', 'A verified partner account is required to perform this action.'));
  }
  next();
}

function optionalAuth(req, res, next) {
  if (!req.get('authorization')) return next();
  return authenticate(req, res, next);
}

function authorizeRoles(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(httpError(403, 'ROLE_FORBIDDEN', 'Your account cannot perform this action.'));
    }
    next();
  };
}

module.exports = { authenticate, optionalAuth, authorizeRoles, requireVerified };
