const bcrypt = require('bcryptjs');
const User = require('../models/User');
const httpError = require('../utils/httpError');
const { signAccessToken, assertJwtConfigured } = require('../utils/jwt');
const { recordAuthEvent } = require('../utils/authAudit');
const cloudinary = require('../config/cloudinary');

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
    verificationStatus: user.verified ? 'verified' : (user.verificationStatus || 'pending'),
    storefrontPhotoUrl: user.storefrontPhotoUrl,
    barangay: user.barangay || 'Unspecified',
    municipality: user.municipality || 'Unspecified',
  };
}

function validateRegisterBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw httpError(400, 'INVALID_REQUEST', 'Provide registration details.');
  }
  const { role, name, email, password, address } = body;
  let location = body.location;
  if (typeof location === 'string') { try { location = JSON.parse(location); } catch { location = null; } }
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
  for (const field of ['barangay', 'municipality']) {
    if (typeof body[field] !== 'string' || body[field].trim().length < 2 || body[field].trim().length > 100) throw httpError(400, `INVALID_${field.toUpperCase()}`, `Enter a valid ${field}.`);
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
    barangay: body.barangay.trim(),
    municipality: body.municipality.trim(),
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
  const verificationDoc = req.files?.verificationDoc?.[0];
  if (!verificationDoc) throw httpError(400, 'VERIFICATION_DOC_REQUIRED', 'Upload a business permit or organization verification document.');
  assertJwtConfigured();
  const { password, ...userFields } = input;
  const passwordHash = await bcrypt.hash(password, 12);
  let user; let privateDoc; let storefront;
  try {
    const config = cloudinary.config();
    if (![config.cloud_name, config.api_key, config.api_secret].every((value) => typeof value === 'string' && value.trim())) {
      throw httpError(503, 'UPLOAD_NOT_CONFIGURED', 'Verification uploads are not configured on this server.');
    }
    privateDoc = await uploadToCloudinary(verificationDoc.buffer, { folder: 'salbar-kain/private-verification', resource_type: 'raw', type: 'private', format: verificationDoc.mimetype === 'application/pdf' ? 'pdf' : verificationDoc.mimetype.split('/')[1] });
    if (req.files?.storefrontPhoto?.[0]) storefront = await uploadToCloudinary(req.files.storefrontPhoto[0].buffer, { folder: 'salbar-kain/storefronts', resource_type: 'image' });
    user = await User.create({ ...userFields, passwordHash, verificationStatus: 'pending', verified: false, verificationDocPublicId: privateDoc.public_id, verificationDocFormat: privateDoc.format || 'pdf', storefrontPhotoUrl: storefront?.secure_url });
  } catch (error) {
    if (privateDoc?.public_id) await cloudinary.uploader.destroy(privateDoc.public_id, { resource_type: 'raw', type: 'private' }).catch(() => {});
    if (storefront?.public_id) await cloudinary.uploader.destroy(storefront.public_id, { resource_type: 'image' }).catch(() => {});
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

async function submitVerificationUpdate(req, res) {
  const verificationDoc = req.files?.verificationDoc?.[0];
  if (!verificationDoc) throw httpError(400, 'VERIFICATION_DOC_REQUIRED', 'Upload a permit or organization verification document.');
  if (!['merchant', 'ngo'].includes(req.user.role)) throw httpError(403, 'ROLE_FORBIDDEN', 'Only merchant and NGO partners can submit verification documents.');
  const config = cloudinary.config();
  if (![config.cloud_name, config.api_key, config.api_secret].every((value) => typeof value === 'string' && value.trim())) {
    throw httpError(503, 'UPLOAD_NOT_CONFIGURED', 'Verification uploads are not configured on this server.');
  }
  let privateDoc; let storefront;
  try {
    privateDoc = await uploadToCloudinary(verificationDoc.buffer, { folder: 'salbar-kain/private-verification', resource_type: 'raw', type: 'private', format: verificationDoc.mimetype === 'application/pdf' ? 'pdf' : verificationDoc.mimetype.split('/')[1] });
    if (req.files?.storefrontPhoto?.[0]) storefront = await uploadToCloudinary(req.files.storefrontPhoto[0].buffer, { folder: 'salbar-kain/storefronts', resource_type: 'image' });
    const user = await User.findById(req.user.id).select('+verificationDocPublicId');
    if (!user) throw httpError(404, 'ACCOUNT_NOT_FOUND', 'Partner account was not found.');
    if (user.verificationStatus === 'verified' || user.verified) throw httpError(409, 'ALREADY_VERIFIED', 'Your partner account is already verified.');
    const oldDoc = user.verificationDocPublicId;
    user.verificationDocPublicId = privateDoc.public_id;
    user.verificationDocFormat = privateDoc.format || 'pdf';
    if (storefront) user.storefrontPhotoUrl = storefront.secure_url;
    user.verificationStatus = 'pending'; user.verified = false; user.verificationNote = undefined;
    await user.save();
    if (oldDoc) await cloudinary.uploader.destroy(oldDoc, { resource_type: 'raw', type: 'private' }).catch(() => {});
    return res.status(200).json({ success: true, data: { verificationStatus: user.verificationStatus } });
  } catch (error) {
    if (privateDoc?.public_id) await cloudinary.uploader.destroy(privateDoc.public_id, { resource_type: 'raw', type: 'private' }).catch(() => {});
    if (storefront?.public_id) await cloudinary.uploader.destroy(storefront.public_id, { resource_type: 'image' }).catch(() => {});
    throw error;
  }
}

function uploadToCloudinary(buffer, options) {
  return new Promise((resolve, reject) => cloudinary.uploader.upload_stream(options, (error, result) => {
    if (error) {
      console.error('Cloudinary verification upload failed:', { httpCode: Number(error.http_code) || undefined });
      return reject(httpError(503, 'IMAGE_UPLOAD_FAILED', 'Verification document upload failed. Check the Cloudinary credentials, then try again.'));
    }
    resolve(result);
  }).end(buffer));
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

module.exports = { register, login, submitVerificationUpdate };
