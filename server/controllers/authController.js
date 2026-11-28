const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const { randomInt, createHash } = require('crypto');
const User = require('../models/User');
const httpError = require('../utils/httpError');
const { signAccessToken, assertJwtConfigured } = require('../utils/jwt');
const { recordAuthEvent } = require('../utils/authAudit');
const cloudinary = require('../config/cloudinary');
const { uploadImageBuffer } = require('../utils/uploadImage');

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
    assignedMunicipality: user.role === 'admin' ? (user.assignedMunicipality || 'ALL') : undefined,
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
  let user; let privateDoc; let storefrontUrl;
  try {
    privateDoc = await storeVerificationDocument(verificationDoc);
    if (req.files?.storefrontPhoto?.[0]) storefrontUrl = await uploadImageBuffer(req.files.storefrontPhoto[0], { folder: 'salbarkain/storefronts' });
    user = await User.create({ ...userFields, passwordHash, verificationStatus: 'pending', verified: false, ...privateDoc, storefrontPhotoUrl: storefrontUrl });
  } catch (error) {
    if (privateDoc?.verificationDocPublicId) await cloudinary.uploader.destroy(privateDoc.verificationDocPublicId, { resource_type: 'raw', type: 'private' }).catch(() => {});
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
  let privateDoc; let storefrontUrl;
  try {
    privateDoc = await storeVerificationDocument(verificationDoc);
    if (req.files?.storefrontPhoto?.[0]) storefrontUrl = await uploadImageBuffer(req.files.storefrontPhoto[0], { folder: 'salbarkain/storefronts' });
    const user = await User.findById(req.user.id).select('+verificationDocPublicId +verificationDocDataUrl +verificationDocMimeType');
    if (!user) throw httpError(404, 'ACCOUNT_NOT_FOUND', 'Partner account was not found.');
    if (user.verificationStatus === 'verified' || user.verified) throw httpError(409, 'ALREADY_VERIFIED', 'Your partner account is already verified.');
    const oldDoc = user.verificationDocPublicId;
    user.verificationDocPublicId = privateDoc.verificationDocPublicId || undefined;
    user.verificationDocFormat = privateDoc.verificationDocFormat || undefined;
    user.verificationDocDataUrl = privateDoc.verificationDocDataUrl || '';
    user.verificationDocMimeType = privateDoc.verificationDocMimeType || '';
    if (storefrontUrl) user.storefrontPhotoUrl = storefrontUrl;
    user.verificationStatus = 'pending'; user.verified = false; user.verificationNote = undefined;
    await user.save();
    if (oldDoc) await cloudinary.uploader.destroy(oldDoc, { resource_type: 'raw', type: 'private' }).catch(() => {});
    return res.status(200).json({ success: true, data: { verificationStatus: user.verificationStatus } });
  } catch (error) {
    if (privateDoc?.verificationDocPublicId) await cloudinary.uploader.destroy(privateDoc.verificationDocPublicId, { resource_type: 'raw', type: 'private' }).catch(() => {});
    throw error;
  }
}

async function storeVerificationDocument(file) {
  const config = cloudinary.config();
  const configured = [config.cloud_name, config.api_key, config.api_secret].every((value) => typeof value === 'string' && value.trim());
  if (configured) {
    try {
      const uploaded = await uploadToCloudinary(file.buffer, { folder: 'salbar-kain/private-verification', resource_type: 'raw', type: 'private', format: file.mimetype === 'application/pdf' ? 'pdf' : file.mimetype.split('/')[1] });
      return { verificationDocPublicId: uploaded.public_id, verificationDocFormat: uploaded.format || (file.mimetype === 'application/pdf' ? 'pdf' : file.mimetype.split('/')[1]), verificationDocDataUrl: '', verificationDocMimeType: file.mimetype };
    } catch { console.warn('Private verification document is being stored in the database fallback.'); }
  }
  return { verificationDocPublicId: undefined, verificationDocFormat: undefined, verificationDocDataUrl: `data:${file.mimetype};base64,${file.buffer.toString('base64')}`, verificationDocMimeType: file.mimetype };
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

function inviteDigest(token) {
  if (typeof token !== 'string' || !/^[a-f\d]{64}$/i.test(token.trim())) throw httpError(400, 'INVALID_INVITE', 'This LGU activation link is invalid. Ask the Provincial Super-Admin for a new invite.');
  return createHash('sha256').update(token.trim()).digest('hex');
}

async function verifyLguInvite(req, res) {
  const digest = inviteDigest(req.params.token);
  const user = await User.findOne({ role: 'admin', inviteTokenHash: digest, inviteExpires: { $gt: new Date() }, verificationStatus: 'pending', assignedMunicipality: { $ne: 'ALL' } }).select('+inviteTokenHash +inviteExpires').lean();
  if (!user) throw httpError(410, 'INVITE_INVALID_OR_EXPIRED', 'This activation link is expired or has already been used. Ask the Provincial Super-Admin for a new invite.');
  res.set('Cache-Control', 'no-store').json({ success: true, data: { officerName: user.name, email: user.email, assignedMunicipality: user.assignedMunicipality || user.municipality } });
}

async function activateLguAdmin(req, res) {
  const digest = inviteDigest(req.body?.token);
  const password = req.body?.password;
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_LENGTH) {
    throw httpError(400, 'INVALID_PASSWORD', `Password must be at least 8 characters and no more than ${PASSWORD_MAX_LENGTH} UTF-8 bytes.`);
  }
  assertJwtConfigured();
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.findOneAndUpdate(
    { role: 'admin', inviteTokenHash: digest, inviteExpires: { $gt: new Date() }, verificationStatus: 'pending', assignedMunicipality: { $ne: 'ALL' } },
    { $set: { passwordHash, verificationStatus: 'verified', verified: true }, $unset: { inviteTokenHash: 1, inviteExpires: 1 } },
    { new: true, runValidators: true },
  );
  if (!user) throw httpError(410, 'INVITE_INVALID_OR_EXPIRED', 'This activation link is expired or has already been used. Ask the Provincial Super-Admin for a new invite.');
  const token = signAccessToken(user);
  const production = process.env.NODE_ENV === 'production';
  res.cookie('salbarkain_token', token, { httpOnly: true, secure: production, sameSite: production ? 'none' : 'lax', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/' });
  await recordAuthEvent(req, 'lgu_admin_activated', { email: user.email, userId: user._id });
  res.status(200).json({ success: true, data: { user: publicUser(user), token } });
}

async function requestPasswordCode(req, res) {
  const user = await User.findOne({ _id: req.user.id, role: 'merchant' });
  if (!user) throw httpError(404, 'ACCOUNT_NOT_FOUND', 'Merchant account was not found.');

  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();
  if (smtpUser && !smtpPass) throw httpError(503, 'SMTP_NOT_CONFIGURED', 'Email delivery is not configured. Set SMTP_PASS on the server and try again.');
  const code = String(randomInt(100000, 1000000));
  user.passwordResetCodeHash = await bcrypt.hash(code, 12);
  user.passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000);
  await user.save();

  if (!smtpUser) {
    console.info(`[DEV EMAIL CODE for ${user.email}]: ${code}`);
    return res.status(200).json({ success: true, message: 'Verification code created. Check the server console in development, or your email if SMTP is configured.' });
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: { user: smtpUser, pass: smtpPass },
  });
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM?.trim() || smtpUser,
      to: user.email,
      subject: 'SalbarKain password change verification code',
      text: `Your SalbarKain password change code is ${code}. It expires in 10 minutes. If you did not request this, ignore this message.`,
    });
  } catch (error) {
    user.passwordResetCodeHash = null;
    user.passwordResetExpires = null;
    await user.save();
    console.error('Password verification email failed:', { code: error.code || 'SMTP_SEND_FAILED' });
    throw httpError(503, 'EMAIL_DELIVERY_FAILED', 'The verification email could not be sent. Check your SMTP settings and try again.');
  }
  res.status(200).json({ success: true, message: 'A 6-digit verification code was sent to your registered email.' });
}

async function confirmPasswordChange(req, res) {
  const { code, newPassword } = req.body || {};
  if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) throw httpError(400, 'INVALID_VERIFICATION_CODE', 'Enter the 6-digit code from your email.');
  if (typeof newPassword !== 'string' || newPassword.length < 8 || Buffer.byteLength(newPassword, 'utf8') > PASSWORD_MAX_LENGTH) {
    throw httpError(400, 'INVALID_PASSWORD', `New password must be at least 8 characters and no more than ${PASSWORD_MAX_LENGTH} UTF-8 bytes.`);
  }

  const user = await User.findOne({ _id: req.user.id, role: 'merchant' })
    .select('+passwordHash +passwordResetCodeHash +passwordResetExpires');
  if (!user) throw httpError(404, 'ACCOUNT_NOT_FOUND', 'Merchant account was not found.');
  if (!user.passwordResetCodeHash || !user.passwordResetExpires || user.passwordResetExpires <= new Date()) {
    throw httpError(410, 'VERIFICATION_CODE_EXPIRED', 'The verification code has expired. Request a new code.');
  }
  if (!(await bcrypt.compare(code.trim(), user.passwordResetCodeHash))) throw httpError(400, 'INVALID_VERIFICATION_CODE', 'That verification code is incorrect.');

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.passwordResetCodeHash = null;
  user.passwordResetExpires = null;
  await user.save();
  await recordAuthEvent(req, 'password_change_success', { email: user.email, userId: user._id });
  res.status(200).json({ success: true, message: 'Password updated securely.' });
}

module.exports = { register, login, submitVerificationUpdate, requestPasswordCode, confirmPasswordChange, verifyLguInvite, activateLguAdmin };
