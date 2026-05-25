import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useRouter, useSegments } from 'expo-router';

interface Customer {
  id: number;
  full_name: string;
  mobile_number: string;
  [key: string]: any;
}

interface AuthContextType {
  user: Customer | null;
  isLoading: boolean;
  login: (token: string, customer: Customer) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Customer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // Load token and user from SecureStore on startup
    const loadUser = async () => {
      try {
        const token = await SecureStore.getItemAsync('mpc_token');
        const customerData = await SecureStore.getItemAsync('mpc_customer');

        if (token && customerData) {
          setUser(JSON.parse(customerData));
        }
      } catch (error) {
        console.error('Failed to load auth state', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();
  }, []);

  // Handle routing based on auth state
  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = (segments[0] as string) === '(auth)' || (segments[0] as string) === 'login';
    
    if (!user && !inAuthGroup) {
      // Redirect to login if not logged in and not already in auth group
      router.replace('/login');
    } else if (user && inAuthGroup) {
      // Redirect to tabs if logged in and in auth group
      router.replace('/(tabs)');
    }
  }, [user, isLoading, segments]);

  const login = async (token: string, customer: Customer) => {
    setIsLoading(true);
    try {
      await SecureStore.setItemAsync('mpc_token', token);
      await SecureStore.setItemAsync('mpc_customer', JSON.stringify(customer));
      setUser(customer);
    } catch (error) {
      console.error('Error saving auth data', error);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await SecureStore.deleteItemAsync('mpc_token');
      await SecureStore.deleteItemAsync('mpc_customer');
      setUser(null);
    } catch (error) {
      console.error('Error removing auth data', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
