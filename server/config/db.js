const mongoose = require('mongoose');
const User = require('../models/User');
const Batch = require('../models/Batch');
const Claim = require('../models/Claim');
const AuthLog = require('../models/AuthLog');
const ImpactEntry = require('../models/ImpactEntry');
const ReportReporter = require('../models/ReportReporter');

async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required. Copy server/.env.example to server/.env.');

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });

  // Ensure the geospatial and pending-claim unique indexes exist before serving traffic.
  // Migrate the original one-pending-claim indexes before creating indexes that
  // keep the guest lock while allowing verified NGOs up to three active passes.
  for (const indexName of ['one_pending_claim_per_device', 'one_pending_claim_per_phone']) {
    try { await Claim.collection.dropIndex(indexName); } catch (error) { if (error.codeName !== 'IndexNotFound' && error.code !== 27) throw error; }
  }
  await Claim.updateMany({ isNgoClaim: { $exists: false } }, { $set: { isNgoClaim: false } });
  await Promise.all([User.createIndexes(), Batch.createIndexes(), Claim.createIndexes(), AuthLog.createIndexes(), ImpactEntry.createIndexes(), ReportReporter.createIndexes()]);
  const ngoCounts = await Claim.aggregate([{ $match: { status: 'pending', isNgoClaim: true, claimantUserId: { $exists: true } } }, { $group: { _id: '$claimantUserId', count: { $sum: 1 } } }]);
  await User.updateMany({ role: 'ngo' }, { $set: { activeNgoClaimCount: 0 } });
  if (ngoCounts.length) await User.bulkWrite(ngoCounts.map(({ _id, count }) => ({ updateOne: { filter: { _id, role: 'ngo' }, update: { $set: { activeNgoClaimCount: count } } } })));
  console.log('Connected to MongoDB and ensured application indexes');
  return mongoose.connection;
}

module.exports = connectDatabase;
