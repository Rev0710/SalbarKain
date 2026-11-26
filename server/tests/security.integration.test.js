const { test } = require('node:test');
const assert = require('node:assert/strict');

const testUri = process.env.TEST_MONGODB_URI;

if (!testUri) {
  test('security integration scenarios require TEST_MONGODB_URI', { skip: 'Set TEST_MONGODB_URI to a dedicated MongoDB database whose name includes test.' }, () => {});
} else {
  const databaseName = new URL(testUri).pathname.slice(1).split('?')[0];
  if (!/(?:^|[_-])test(?:[_-]|$)/i.test(databaseName)) {
    throw new Error('Refusing to run destructive integration scenarios: TEST_MONGODB_URI database name must include "test".');
  }

  process.env.MONGODB_URI = testUri;
  process.env.TRUST_PROXY = '1';
  process.env.AUTH_RATE_LIMIT = '10';
  process.env.CLAIM_RATE_LIMIT = '5';
  process.env.JWT_SECRET ||= require('node:crypto').randomBytes(48).toString('hex');
  process.env.AUTH_LOG_HMAC_SECRET ||= require('node:crypto').randomBytes(48).toString('hex');

  const mongoose = require('mongoose');
  const bcrypt = require('bcryptjs');
  const jwt = require('jsonwebtoken');
  const app = require('../server');
  const User = require('../models/User');
  const Batch = require('../models/Batch');
  const Claim = require('../models/Claim');
  const AuthLog = require('../models/AuthLog');
  const { signAccessToken } = require('../utils/jwt');
  const { hashIdentifier } = require('../utils/authAudit');

  test('atomic claims, QR ownership and expiry, abuse logging, rate limits, and upload caps', async (t) => {
    await mongoose.connect(testUri);
    await Promise.all([User.createIndexes(), Batch.createIndexes(), Claim.createIndexes(), AuthLog.createIndexes()]);
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const createdUserIds = [];
    const createdBatchIds = [];
    const ipHeader = (ip) => ({ 'x-forwarded-for': ip });
    const testPassword = 'Integration-Test-Password-123!';
    const testPasswordHash = await bcrypt.hash(testPassword, 4);
    const requestJson = async (path, { ip, ...options } = {}) => {
      const headers = { ...(options.headers || {}), ...(ip ? ipHeader(ip) : {}) };
      const response = await fetch(`${base}${path}`, { ...options, headers });
      let body = {};
      try { body = await response.json(); } catch {}
      return { status: response.status, body };
    };
    const createMerchant = async (tag) => {
      const user = await User.create({ role: 'merchant', name: `Integration ${tag}`, email: `integration-${tag}-${Date.now()}@test.invalid`, passwordHash: testPasswordHash, storeName: `Integration shop ${tag}`, category: 'bakery', address: 'Integration test location, Iloilo City', location: { type: 'Point', coordinates: [122.56, 10.72] } });
      createdUserIds.push(user._id);
      return { user, token: signAccessToken(user) };
    };
    const createBatch = async (merchant, tag, quantity) => {
      const batch = await Batch.create({ merchantId: merchant._id, photoUrl: 'https://res.cloudinary.com/salbar-kain-test/image/upload/test.jpg', itemName: `Integration ${tag}`, quantity, remainingQty: quantity, price: 10, isDonationOnly: false, expiresAt: new Date(Date.now() + 60 * 60 * 1000), status: 'active' });
      createdBatchIds.push(batch._id);
      return batch;
    };
    const guestClaim = (batchId, index, ip) => requestJson('/api/claims', {
      ip, method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ batchId: batchId.toString(), qty: 1, buyerName: `Test Buyer ${index}`, phone: `0917${String(1000000 + index).padStart(7, '0')}`, deviceToken: `test-device-${Date.now()}-${index}` }),
    });

    try {
      await t.test('last portions cannot be overbooked by simultaneous guests', async () => {
        const merchant = await createMerchant('race');
        const batch = await createBatch(merchant.user, 'race batch', 1);
        const responses = await Promise.all(Array.from({ length: 5 }, (_, index) => guestClaim(batch._id, index, '198.51.100.1')));
        assert.equal(responses.filter((r) => r.status === 201).length, 1, 'exactly one claim should reserve the only portion');
        assert.equal(responses.filter((r) => r.status === 409 && r.body.code === 'BATCH_UNAVAILABLE').length, 4);
        const persisted = await Batch.findById(batch._id).lean();
        assert.equal(persisted.remainingQty, 0);
        assert.equal(persisted.status, 'sold_out');
      });

      await t.test('only the owning merchant can redeem a QR and an expired pickup pass is rejected', async () => {
        const owner = await createMerchant('owner'); const other = await createMerchant('other');
        const wrongMerchantBatch = await createBatch(owner.user, 'wrong merchant', 2);
        const wrongMerchantClaim = await guestClaim(wrongMerchantBatch._id, 20, '198.51.100.2');
        assert.equal(wrongMerchantClaim.status, 201);
        const wrongScan = await requestJson(`/api/claims/${wrongMerchantClaim.body.data.claim.qrToken}/verify`, { method: 'PATCH', headers: { authorization: `Bearer ${other.token}` }, ip: '198.51.100.2' });
        assert.equal(wrongScan.status, 404);
        const correctScan = await requestJson(`/api/claims/${wrongMerchantClaim.body.data.claim.qrToken}/verify`, { method: 'PATCH', headers: { authorization: `Bearer ${owner.token}` }, ip: '198.51.100.2' });
        assert.equal(correctScan.status, 200);
        assert.equal(correctScan.body.data.claim.status, 'completed');

        const expiredBatch = await createBatch(owner.user, 'expired pass', 1);
        const expiredClaim = await guestClaim(expiredBatch._id, 21, '198.51.100.3');
        assert.equal(expiredClaim.status, 201);
        await Claim.updateOne({ _id: expiredClaim.body.data.claim.id }, { $set: { pickupDeadline: new Date(Date.now() - 1000) } });
        const expiredScan = await requestJson(`/api/claims/${expiredClaim.body.data.claim.qrToken}/verify`, { method: 'PATCH', headers: { authorization: `Bearer ${owner.token}` }, ip: '198.51.100.3' });
        assert.equal(expiredScan.status, 410);
        assert.equal(expiredScan.body.code, 'PICKUP_PASS_EXPIRED');
        assert.equal((await Claim.findById(expiredClaim.body.data.claim.id)).status, 'expired');
        assert.equal((await Batch.findById(expiredBatch._id)).remainingQty, 1, 'expired claims must release their reservation');

        const expiredJwt = jwt.sign({ role: 'merchant' }, process.env.JWT_SECRET, { subject: owner.user._id.toString(), issuer: 'salbar-kain', audience: 'salbar-kain-client', expiresIn: -1 });
        const expiredAuth = await requestJson('/api/batches/mine', { headers: { authorization: `Bearer ${expiredJwt}` }, ip: '198.51.100.3' });
        assert.equal(expiredAuth.status, 401);
        assert.equal(expiredAuth.body.code, 'INVALID_TOKEN');
      });

      await t.test('NoSQL and SQL-like probes are detected without logging credential values', async () => {
        const noSql = await requestJson('/api/auth/login', { method: 'POST', ip: '198.51.100.5', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: { $ne: null }, password: 'never-store-this' }) });
        assert.equal(noSql.status, 400);
        const sql = await requestJson('/api/auth/login', { method: 'POST', ip: '198.51.100.6', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: "x' UNION SELECT password FROM users--", password: 'never-store-this-either' }) });
        assert.equal(sql.status, 401);
        const xss = await requestJson('/api/auth/register', { method: 'POST', ip: '198.51.100.10', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'buyer', name: '<script>alert(1)</script>', email: 'xss@test.invalid', password: 'never-store-this-password', address: 'Test address', location: { type: 'Point', coordinates: [122.56, 10.72] } }) });
        assert.equal(xss.status, 400);
        const noSqlLog = await AuthLog.findOne({ ipHash: hashIdentifier('198.51.100.5'), event: 'suspicious_input' }).lean();
        const sqlLog = await AuthLog.findOne({ ipHash: hashIdentifier('198.51.100.6'), event: 'suspicious_input' }).lean();
        const xssLog = await AuthLog.findOne({ ipHash: hashIdentifier('198.51.100.10'), event: 'suspicious_input' }).lean();
        assert.ok(noSqlLog?.signals.includes('nosql_operator_or_path_key'));
        assert.ok(sqlLog?.signals.includes('sql_injection_pattern'));
        assert.ok(xssLog?.signals.includes('xss_markup_pattern'));
        const logs = await AuthLog.find({ ipHash: { $in: [hashIdentifier('198.51.100.5'), hashIdentifier('198.51.100.6'), hashIdentifier('198.51.100.10')] } }).lean();
        assert.ok(logs.every((log) => !JSON.stringify(log).includes('never-store-this')));
      });

      await t.test('successful sign-ins are recorded with a user reference', async () => {
        const account = await createMerchant('login-log');
        const response = await requestJson('/api/auth/login', { method: 'POST', ip: '198.51.100.9', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: account.user.email, password: testPassword }) });
        assert.equal(response.status, 200);
        assert.ok(await AuthLog.findOne({ event: 'login_success', userId: account.user._id, ipHash: hashIdentifier('198.51.100.9') }));
      });

      await t.test('failed sign-ins persist logs and the auth limiter returns 429', async () => {
        for (let attempt = 0; attempt < 10; attempt += 1) {
          const response = await requestJson('/api/auth/login', { method: 'POST', ip: '198.51.100.4', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'missing-user@test.invalid', password: 'wrong-password-value' }) });
          assert.equal(response.status, 401);
        }
        const limited = await requestJson('/api/auth/login', { method: 'POST', ip: '198.51.100.4', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'missing-user@test.invalid', password: 'wrong-password-value' }) });
        assert.equal(limited.status, 429);
        assert.equal(limited.body.code, 'AUTH_RATE_LIMITED');
        assert.ok(await AuthLog.countDocuments({ ipHash: hashIdentifier('198.51.100.4'), event: 'login_failure' }) >= 10);
        assert.ok(await AuthLog.findOne({ ipHash: hashIdentifier('198.51.100.4'), event: 'rate_limited' }));
      });

      await t.test('claim limiter blocks repeated requests and oversized images get a structured 413', async () => {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const response = await requestJson('/api/claims', { method: 'POST', ip: '198.51.100.7', headers: { 'content-type': 'application/json' }, body: '{}' });
          assert.equal(response.status, 400);
        }
        const limited = await requestJson('/api/claims', { method: 'POST', ip: '198.51.100.7', headers: { 'content-type': 'application/json' }, body: '{}' });
        assert.equal(limited.status, 429);
        assert.equal(limited.body.code, 'CLAIM_RATE_LIMITED');

        const merchant = await createMerchant('upload');
        const form = new FormData();
        form.append('photo', new Blob([Buffer.alloc(5 * 1024 * 1024 + 1)], { type: 'image/png' }), 'too-large.png');
        const upload = await fetch(`${base}/api/batches`, { method: 'POST', headers: { authorization: `Bearer ${merchant.token}`, ...ipHeader('198.51.100.8') }, body: form });
        const result = await upload.json();
        assert.equal(upload.status, 413);
        assert.equal(result.code, 'FILE_TOO_LARGE');
      });
    } finally {
      await Claim.deleteMany({ merchantId: { $in: createdUserIds } });
      await Batch.deleteMany({ _id: { $in: createdBatchIds } });
      await User.deleteMany({ _id: { $in: createdUserIds } });
      await new Promise((resolve) => server.close(resolve));
      await mongoose.disconnect();
    }
  });
}
