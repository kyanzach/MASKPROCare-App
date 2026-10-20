import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useRouter, useSegments } from 'expo-router';
import { setSignOutHandler } from '@/api/client';

interface Customer {
  id: number;
  full_name: string;
  mobile_number: string;
  [key: string]: any;
}

export interface ImpersonationState {
  originalToken: string;
  originalCustomer: string;
  impersonatedBy: string;
  customerName: string;
}

interface AuthContextType {
  user: Customer | null;
  isLoading: boolean;
  impersonation: ImpersonationState | null;
  login: (token: string, customer: Customer) => Promise<void>;
  logout: () => Promise<void>;
  startImpersonation: (token: string, customer: Customer, meta: ImpersonationState) => Promise<void>;
  exitImpersonation: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Customer | null>(null);
  const [impersonation, setImpersonation] = useState<ImpersonationState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    setSignOutHandler(() => {
      setUser(null);
      setImpersonation(null);
    });
    return () => {
      setSignOutHandler(() => {});
    };
  }, []);

  useEffect(() => {
    // Load token, user, and impersonation state from SecureStore on startup
    const loadUser = async () => {
      try {
        const token = await SecureStore.getItemAsync('mpc_token');
        const customerData = await SecureStore.getItemAsync('mpc_customer');
        const impData = await SecureStore.getItemAsync('mpc_impersonation');

        if (token && customerData) {
          setUser(JSON.parse(customerData));
        }
        if (impData) {
          setImpersonation(JSON.parse(impData));
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

    const currentRoute = (segments[0] as string) || '';
    const isPublicRoute = currentRoute === 'login' || currentRoute === 'admin-login';

    if (!user && !isPublicRoute) {
      // Redirect to login if not logged in and not on public route
      router.replace('/login');
    } else if (user && currentRoute === 'login') {
      // Redirect to tabs if logged in and on regular login route
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
      await SecureStore.deleteItemAsync('mpc_impersonation');
      await SecureStore.deleteItemAsync('admin_token');
      setUser(null);
      setImpersonation(null);
    } catch (error) {
      console.error('Error removing auth data', error);
    } finally {
      setIsLoading(false);
    }
  };

  const startImpersonation = async (token: string, customer: Customer, meta: ImpersonationState) => {
    setIsLoading(true);
    try {
      await SecureStore.setItemAsync('mpc_token', token);
      await SecureStore.setItemAsync('mpc_customer', JSON.stringify(customer));
      await SecureStore.setItemAsync('mpc_impersonation', JSON.stringify(meta));
      setImpersonation(meta);
      setUser(customer);
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Error starting impersonation', error);
    } finally {
      setIsLoading(false);
    }
  };

  const exitImpersonation = async () => {
    if (!impersonation) return;
    setIsLoading(true);
    try {
      await SecureStore.setItemAsync('mpc_token', impersonation.originalToken);
      if (impersonation.originalCustomer) {
        await SecureStore.setItemAsync('mpc_customer', impersonation.originalCustomer);
        setUser(JSON.parse(impersonation.originalCustomer));
      }
      await SecureStore.deleteItemAsync('mpc_impersonation');
      setImpersonation(null);
      router.replace('/admin' as any);
    } catch (error) {
      console.error('Error exiting impersonation', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        impersonation,
        login,
        logout,
        startImpersonation,
        exitImpersonation,
      }}
    >
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
