import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// Set to local IP during dev or fallback to production
const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://care.maskpro.ph/api';

const client = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor
client.interceptors.request.use(
  async (config) => {
    try {
      // Get token from SecureStore
      const token = await SecureStore.getItemAsync('mpc_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('Error fetching token from SecureStore:', error);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response Interceptor
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Handle 401 Unauthorized globally if needed (e.g., clear token and redirect to login)
    if (error.response && error.response.status === 401) {
      try {
        await SecureStore.deleteItemAsync('mpc_token');
        await SecureStore.deleteItemAsync('mpc_customer');
        // Redirection should be handled in an AuthContext or via router events
      } catch (e) {
        console.error('Error clearing secure store on 401:', e);
      }
    }
    return Promise.reject(error);
  }
);

export default client;
