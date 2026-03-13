/**
 * MaskPro Care API — Express Entry Point
 * Port 3004 | PM2: maskpro-care
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3004;

// --- CORS ---
const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    if (process.env.NODE_ENV !== 'production') return cb(null, true); // permissive in dev
    cb(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400
}));

// --- Body parsing ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Static files (vehicle photos) ---
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// --- Routes ---
const authRoutes = require('./routes/auth');
const vehicleRoutes = require('./routes/vehicles');
const bookingRoutes = require('./routes/bookings');
const dashboardRoutes = require('./routes/dashboard');
const profileRoutes = require('./routes/profile');
const notificationRoutes = require('./routes/notifications');
const serviceRoutes = require('./routes/services');
const loyaltyRoutes = require('./routes/loyalty');

app.use('/api/auth', authRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/loyalty', loyaltyRoutes);

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
app.listen(PORT, () => {
  console.log(`✅ MaskPro Care API running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
});

module.exports = app;
