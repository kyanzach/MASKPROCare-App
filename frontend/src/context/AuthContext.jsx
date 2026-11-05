import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI, setClientAuthToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [customer, setCustomer] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let savedToken = null;
    let savedCustomer = null;
    try {
      savedToken = localStorage.getItem('mpc_token') || sessionStorage.getItem('mpc_token');
      savedCustomer = localStorage.getItem('mpc_customer') || sessionStorage.getItem('mpc_customer');
    } catch {}
    if (savedToken && savedCustomer) {
      setClientAuthToken(savedToken);
      setToken(savedToken);
      try { setCustomer(JSON.parse(savedCustomer)); } catch {}
    }
    setLoading(false);
  }, []);

  const login = useCallback((tokenStr, customerData) => {
    setClientAuthToken(tokenStr);
    try { localStorage.setItem('mpc_customer', JSON.stringify(customerData)); } catch {}
    try { sessionStorage.setItem('mpc_customer', JSON.stringify(customerData)); } catch {}
    setToken(tokenStr);
    setCustomer(customerData);
  }, []);

  const logout = async () => {
    try { await authAPI.logout(); } catch {}
    setClientAuthToken(null);
    try { localStorage.removeItem('mpc_customer'); } catch {}
    try { sessionStorage.removeItem('mpc_customer'); } catch {}
    setToken(null);
    setCustomer(null);
  };

  const updateCustomer = (data) => {
    const updated = { ...customer, ...data };
    localStorage.setItem('mpc_customer', JSON.stringify(updated));
    setCustomer(updated);
  };

  const isAuthenticated = !!token;

  return (
    <AuthContext.Provider value={{ customer, token, loading, isAuthenticated, login, logout, updateCustomer }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
