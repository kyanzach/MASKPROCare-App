import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [customer, setCustomer] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('mpc_token');
    const savedCustomer = localStorage.getItem('mpc_customer');
    if (savedToken && savedCustomer) {
      setToken(savedToken);
      setCustomer(JSON.parse(savedCustomer));
    }
    setLoading(false);
  }, []);

  const login = (tokenStr, customerData) => {
    localStorage.setItem('mpc_token', tokenStr);
    localStorage.setItem('mpc_customer', JSON.stringify(customerData));
    setToken(tokenStr);
    setCustomer(customerData);
  };

  const logout = async () => {
    try { await authAPI.logout(); } catch {}
    localStorage.removeItem('mpc_token');
    localStorage.removeItem('mpc_customer');
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
