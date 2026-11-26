require('dotenv').config();

const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const mongoose = require('mongoose');
const connectDatabase = require('./config/db');
const cloudinary = require('./config/cloudinary');
const authRoutes = require('./routes/authRoutes');
const batchRoutes = require('./routes/batchRoutes');
const claimRoutes = require('./routes/claimRoutes');
const statsRoutes = require('./routes/statsRoutes');
const adminRoutes = require('./routes/adminRoutes');
const impactRoutes = require('./routes/impactRoutes');
const errorHandler = require('./middleware/errorHandler');
const securityAudit = require('./middleware/securityAudit');
const notFound = require('./middleware/notFound');
const { startExpiryWorker } = require('./utils/expiryWorker');

const app = express();
const port = Number(process.env.PORT) || 5000;
const allowedOrigins = new Set(
  (process.env.CLIENT_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    const error = new Error('Origin is not allowed by CORS');
    error.statusCode = 403;
    error.code = 'ORIGIN_FORBIDDEN';
    return callback(error);
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 600,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(securityAudit);
app.use(mongoSanitize());

app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    status: 'ok',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    cloudinaryConfigured: Boolean(cloudinary.config().cloud_name),
  });
});
app.use('/api/auth', authRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/claims', claimRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/impact', impactRoutes);
app.use(notFound);
app.use(errorHandler);

async function start() {
  try {
    await connectDatabase();
    const stopExpiryWorker = startExpiryWorker();
    const server = app.listen(port, () => {
      console.log(`SalbarKain API listening on port ${port}`);
    });

    async function shutdown() {
      await stopExpiryWorker();
      server.close(async () => {
        await mongoose.disconnect();
        process.exit(0);
      });
    }
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
  } catch (error) {
    console.error('Unable to start API:', error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) start();
module.exports = app;
