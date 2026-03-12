import axios from 'axios';

// In production (care.maskpro.ph), Nginx proxies /api/ → Express:3004
// In dev, Vite runs on :5173 so we need the full Express URL
const API_BASE = import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? '/api' : 'http://localhost:3004/api');

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('mpc_token');
  if (token) {
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
      // Skip redirect for background polling calls (notifications)
      const url = error.config?.url || '';
      if (url.includes('/notifications/')) {
        // Silent fail for notification polling — don't nuke the session
        return Promise.reject(error);
      }
      isRedirecting = true;
      localStorage.removeItem('mpc_token');
      localStorage.removeItem('mpc_customer');
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
