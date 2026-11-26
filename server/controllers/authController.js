const bcrypt = require('bcryptjs');
const User = require('../models/User');
const httpError = require('../utils/httpError');
const { signAccessToken, assertJwtConfigured } = require('../utils/jwt');
const { recordAuthEvent } = require('../utils/authAudit');

const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_LENGTH = 72;

function publicUser(user) {
  return {
    id: user._id.toString(),
    role: user.role,
    name: user.name,
    email: user.email,
    storeName: user.storeName,
    organizationName: user.organizationName,
    verified: user.verified,
  };
}

function validateRegisterBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw httpError(400, 'INVALID_REQUEST', 'Provide registration details.');
  }
  const { role, name, email, password, address, location } = body;
  if (!['merchant', 'ngo'].includes(role)) {
    throw httpError(400, 'INVALID_ROLE', 'Role must be merchant or ngo.');
  }
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
    throw httpError(400, 'INVALID_NAME', 'Enter a name between 2 and 100 characters.');
  }
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    throw httpError(400, 'INVALID_EMAIL', 'Enter a valid email address.');
  }
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH || Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_LENGTH) {
    throw httpError(400, 'INVALID_PASSWORD', `Password must be at least ${PASSWORD_MIN_LENGTH} characters and no more than ${PASSWORD_MAX_LENGTH} UTF-8 bytes.`);
  }
  if (typeof address !== 'string' || address.trim().length < 5 || address.trim().length > 300) {
    throw httpError(400, 'INVALID_ADDRESS', 'Enter a valid address.');
  }
  if (!location || location.type !== 'Point' || !Array.isArray(location.coordinates)) {
    throw httpError(400, 'INVALID_LOCATION', 'Provide a GeoJSON Point with [longitude, latitude] coordinates.');
  }

  if (role === 'merchant') {
    if (typeof body.storeName !== 'string' || !body.storeName.trim() || body.storeName.trim().length > 120) {
      throw httpError(400, 'INVALID_STORE_NAME', 'Merchant registration requires a store name.');
    }
    if (!['bakery', 'eatery', 'grocery', 'other'].includes(body.category)) {
      throw httpError(400, 'INVALID_CATEGORY', 'Choose a valid merchant category.');
    }
  } else if (typeof body.organizationName !== 'string' || !body.organizationName.trim() || body.organizationName.trim().length > 160) {
    throw httpError(400, 'INVALID_ORGANIZATION', 'NGO registration requires an organization name.');
  }

  return {
    role,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password,
    address: address.trim(),
    location,
    phone: typeof body.phone === 'string' ? body.phone.trim() : undefined,
    storeName: role === 'merchant' ? body.storeName.trim() : undefined,
    category: role === 'merchant' ? body.category : undefined,
    organizationName: role === 'ngo' ? body.organizationName.trim() : undefined,
  };
}

async function register(req, res) {
  let input;
  try {
    input = validateRegisterBody(req.body);
  } catch (error) {
    await recordAuthEvent(req, 'register_failure', { email: typeof req.body?.email === 'string' ? req.body.email : undefined });
    throw error;
  }
  assertJwtConfigured();
  const { password, ...userFields } = input;
  const passwordHash = await bcrypt.hash(password, 12);
  let user;
  try {
    user = await User.create({ ...userFields, passwordHash });
  } catch (error) {
    if (error.code === 11000) {
      await recordAuthEvent(req, 'register_failure', { email: input.email });
      throw httpError(409, 'EMAIL_ALREADY_REGISTERED', 'An account with this email already exists.');
    }
    throw error;
  }
  const token = signAccessToken(user);
  await recordAuthEvent(req, 'register_success', { email: user.email, userId: user._id });
  res.status(201).json({ success: true, data: { user: publicUser(user), token } });
}

async function login(req, res) {
  const body = req.body;
  if (!body || typeof body.email !== 'string' || typeof body.password !== 'string') {
    await recordAuthEvent(req, 'login_failure', { email: typeof body?.email === 'string' ? body.email : undefined });
    throw httpError(400, 'INVALID_CREDENTIALS', 'Enter your email and password.');
  }

  const user = await User.findOne({ email: body.email.trim().toLowerCase() }).select('+passwordHash');
  const valid = user && await bcrypt.compare(body.password, user.passwordHash);
  if (!valid) {
    await recordAuthEvent(req, 'login_failure', { email: body.email });
    throw httpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }

  const token = signAccessToken(user);
  await recordAuthEvent(req, 'login_success', { email: user.email, userId: user._id });
  res.status(200).json({ success: true, data: { user: publicUser(user), token } });
}

module.exports = { register, login };
