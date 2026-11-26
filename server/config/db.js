const mongoose = require('mongoose');
const User = require('../models/User');
const Batch = require('../models/Batch');
const Claim = require('../models/Claim');
const AuthLog = require('../models/AuthLog');
const ImpactEntry = require('../models/ImpactEntry');

async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required. Copy server/.env.example to server/.env.');

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });

  // Ensure the geospatial and pending-claim unique indexes exist before serving traffic.
  await Promise.all([User.createIndexes(), Batch.createIndexes(), Claim.createIndexes(), AuthLog.createIndexes(), ImpactEntry.createIndexes()]);
  console.log('Connected to MongoDB and ensured application indexes');
  return mongoose.connection;
}

module.exports = connectDatabase;
