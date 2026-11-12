/**
 * MaskPro Care API — Express Entry Point
 * Port 3004 | PM2: maskpro-care
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { securityHeadersMiddleware } = require('./utils/security');

const app = express();
const PORT = process.env.PORT || 3004;
const BIND_HOST = process.env.BIND_HOST || (process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0');

// --- Core Express Hardening ---
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(securityHeadersMiddleware);

// --- CORS ---
const allowedOrigins = (process.env.CORS_ORIGINS || 'https://care.maskpro.ph').split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    if (process.env.NODE_ENV !== 'production') return cb(null, true); // permissive in dev
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Client-Platform'],
  maxAge: 86400
}));

// --- Body parsing (bounded to prevent memory exhaustion) ---
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));

// --- Static files (vehicle photos) ---
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), {
  dotfiles: 'deny',
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
  }
}));
// --- Static files (profile photos) ---
app.use('/api/uploads/photos', express.static(path.join(__dirname, 'uploads', 'photos'), {
  dotfiles: 'deny',
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
  }
}));

// --- Routes ---
const authRoutes = require('./routes/auth');
const aiAuthRoutes = require('./routes/aiAuth');
const vehicleRoutes = require('./routes/vehicles');
const bookingRoutes = require('./routes/bookings');
const dashboardRoutes = require('./routes/dashboard');
const profileRoutes = require('./routes/profile');
const notificationRoutes = require('./routes/notifications');
const serviceRoutes = require('./routes/services');
const loyaltyRoutes = require('./routes/loyalty');
const adminRoutes = require('./routes/admin');
const communityRoutes = require('./routes/community');
const { startLtoReminderScheduler } = require('./services/ltoReminderCron');

app.use('/api/auth', authRoutes);
app.use('/api/auth/ai-login', aiAuthRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/loyalty', loyaltyRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/community', communityRoutes);

// --- Health check (deploy.sh checks /api/health) ---
const healthResponse = (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'MaskPro Care API',
      version: 'v2',
      port: PORT,
      environment: process.env.NODE_ENV || 'development'
    },
    message: 'MaskPro Care API v2 is running',
    errors: []
  });
};
app.get('/api', healthResponse);
app.get('/api/health', healthResponse);

// --- 404 fallback ---
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    data: null,
    message: `Unknown endpoint: ${req.method} ${req.originalUrl}`,
    errors: []
  });
});

// --- Global error handler ---
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({
    success: false,
    data: null,
    message: 'Internal server error',
    errors: []
  });
});

// --- Start ---
app.listen(PORT, BIND_HOST, () => {
  console.log(`✅ MaskPro Care API running on ${BIND_HOST}:${PORT} (${process.env.NODE_ENV || 'development'})`);
  startLtoReminderScheduler();
});

module.exports = app;
