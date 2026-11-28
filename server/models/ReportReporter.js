const mongoose = require('mongoose');

const reportReporterSchema = new mongoose.Schema({
  deviceTokenHash: { type: String, required: true, unique: true, index: true },
  reportTimes: { type: [Date], default: [] },
  falseFlags: { type: Number, default: 0, min: 0 },
  shadowMuted: { type: Boolean, default: false, index: true },
}, { timestamps: true });

module.exports = mongoose.model('ReportReporter', reportReporterSchema);
