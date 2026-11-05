import axios from 'axios';

// In production (care.maskpro.ph), Nginx proxies /api/ → Express:3004
// In dev, Vite runs on :5173 so we need the full Express URL
const API_BASE = import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? '/api' : 'http://localhost:3004/api');

let inMemoryToken = null;
try {
  inMemoryToken = localStorage.getItem('mpc_token') || sessionStorage.getItem('mpc_token') || null;
} catch {}

export function setClientAuthToken(tokenStr) {
  inMemoryToken = tokenStr || null;
  try {
    if (tokenStr) {
      localStorage.setItem('mpc_token', tokenStr);
    } else {
      localStorage.removeItem('mpc_token');
    }
  } catch {}
  try {
    if (tokenStr) {
      sessionStorage.setItem('mpc_token', tokenStr);
    } else {
      sessionStorage.removeItem('mpc_token');
    }
  } catch {}
}

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request (in-memory + localStorage + sessionStorage fallback for iOS Safari)
api.interceptors.request.use((config) => {
  let token = inMemoryToken;
  if (!token) {
    try { token = localStorage.getItem('mpc_token'); } catch {}
  }
  if (!token) {
    try { token = sessionStorage.getItem('mpc_token'); } catch {}
  }
  if (token) {
    inMemoryToken = token;
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses (expired token)
let isRedirecting = false;
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !isRedirecting) {
      // Skip redirect for background polling, activity tracking, and admin calls
      const url = error.config?.url || '';
      if (url.includes('/notifications/') || url.includes('/admin/') || url.includes('/dashboard/activity')) {
        // Silent fail — don't nuke the session
        return Promise.reject(error);
      }
      isRedirecting = true;
      setClientAuthToken(null);
      try { localStorage.removeItem('mpc_customer'); } catch {}
      try { sessionStorage.removeItem('mpc_customer'); } catch {}
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth
export const authAPI = {
  login: (mobile) => api.post('/auth/login', { mobile }),
  verify: (mobile, otp) => api.post('/auth/verify', { mobile, otp }),
  logout: () => api.post('/auth/logout'),
};

// Vehicles
export const vehiclesAPI = {
  list: () => api.get('/vehicles/list'),
  detail: (id) => api.get(`/vehicles/detail/${id}`),
  create: (data) => api.post('/vehicles/create', data),
  update: (data) => api.post('/vehicles/update', data),
  delete: (id) => api.post('/vehicles/delete', { id }),
  uploadPhoto: (vehicleId, file) => {
    const formData = new FormData();
    formData.append('vehicle_id', vehicleId);
    formData.append('photo', file);
    return api.post('/vehicles/upload-photo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Bookings
export const bookingsAPI = {
  list: () => api.get('/bookings/list'),
  detail: (id) => api.get(`/bookings/detail/${id}`),
  create: (data) => api.post('/bookings/create', data),
  cancel: (bookingId) => api.post('/bookings/cancel', { booking_id: bookingId }),
  availability: (data) => api.post('/bookings/availability', data),
};

// Services
export const servicesAPI = {
  list: () => api.get('/services/list'),
};

// Profile
export const profileAPI = {
  get: () => api.get('/profile/get'),
  update: (data) => api.post('/profile/update', data),
};

// Dashboard
export const dashboardAPI = {
  stats: () => api.get('/dashboard/stats'),
};

export default api;
