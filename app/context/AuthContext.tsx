import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import type { AppUser, UserRole } from '../types';
import * as SecureStore from 'expo-secure-store';
import { setAuthTokenGetter } from '../api-client/src/index';
import { signup as apiSignup, login as apiLogin, getCurrentUser, refreshAccessToken } from '../api-client/src/index';
import type { SignupRequest } from '@/api-client/src/generated/api.schemas';
import { cacheData, getCachedData } from '../utils/offlineStorage';
import { hasAccess, normalizeRole } from '@/lib/rbac';

const ACCESS_TOKEN_KEY = 'vaultiline_token';
const REFRESH_TOKEN_KEY = 'vaultiline_refresh_token';

const isWeb = Platform.OS === 'web';

const tokenStore = {
  async getItem(key: string) {
    if (isWeb) return localStorage.getItem(key);
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string) {
    if (isWeb) {
      localStorage.setItem(key, value);
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  },
  async deleteItem(key: string) {
    if (isWeb) {
      localStorage.removeItem(key);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  },
};

interface AuthContextValue {
  currentUser: AppUser | null;
  accessToken: string | null;
  canApproveLoans: boolean;
  canDeleteRecords: boolean;
  canViewAll: boolean;
  canManageUsers: boolean;
  canSuspendUsers: boolean;
  canAdjustLoanLimits: boolean;
  canViewAuditLogs: boolean;
  canTriggerReviews: boolean;
  isLoading: boolean;
  signup: (data: { email: string; password: string; fullName: string; telephone: string; idNumber: string; pfNumber: string; branch: string; role: UserRole; assignment?: string }) => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  otpLogin: (target: string, mode: 'email' | 'phone', token?: string, user?: AppUser) => Promise<void>;
  refreshToken: () => Promise<boolean>;
  logout: () => Promise<void>;
  suspendUser: (userId: string, reason: string) => Promise<boolean>;
  unsuspendUser: (userId: string) => Promise<boolean>;
  deleteUser: (userId: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const setTokens = useCallback(async (access: string, refresh?: string) => {
    await tokenStore.setItem(ACCESS_TOKEN_KEY, access);
    setAccessToken(access);
    setAuthTokenGetter(() => access);
    if (refresh) {
      await tokenStore.setItem(REFRESH_TOKEN_KEY, refresh);
    }
  }, []);

  const clearTokens = useCallback(async () => {
    await tokenStore.deleteItem(ACCESS_TOKEN_KEY);
    await tokenStore.deleteItem(REFRESH_TOKEN_KEY);
    setAccessToken(null);
    setAuthTokenGetter(null);
    setCurrentUser(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function initAuth() {
      try {
        const storedAccess = await tokenStore.getItem(ACCESS_TOKEN_KEY);
        if (!storedAccess) {
          if (!cancelled) setIsLoading(false);
          return;
        }

        setAccessToken(storedAccess);
        setAuthTokenGetter(() => storedAccess);

        try {
          const response = await getCurrentUser();
          if (!cancelled && response.user) {
            const newToken = (response as any).token;
            if (newToken && newToken !== storedAccess) {
              await tokenStore.setItem(ACCESS_TOKEN_KEY, newToken);
              setAccessToken(newToken);
              setAuthTokenGetter(() => newToken);
            }

            const userData = {
              id: response.user.id,
              email: response.user.email,
              fullName: response.user.fullName,
              telephone: response.user.telephone,
              idNumber: response.user.idNumber,
      pfNumber: response.user.pfNumber,
              branch: response.user.branch,
              role: response.user.role as UserRole,
              assignment: response.user.assignment,
              isVerified: (response.user as any).isVerified ?? false,
              isSuspended: (response.user as any).isSuspended ?? false,
              suspensionReason: (response.user as any).suspensionReason ?? null,
              suspendedAt: (response.user as any).suspendedAt ?? null,
              creditScore: (response.user as any).creditScore,
              loanLimit: (response.user as any).loanLimit,
              currentLoanBalance: (response.user as any).currentLoanBalance,
              createdAt: response.user.createdAt,
            };
            await cacheData('userProfile', userData);
            setCurrentUser(userData);
          }
        } catch {
          if (!cancelled) {
            const cachedUser = await getCachedData<AppUser>('userProfile');
            if (cachedUser) {
              setCurrentUser(cachedUser);
            } else {
              await clearTokens();
            }
          }
        }
      } catch (e) {
        console.error('Failed to load tokens:', e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    initAuth();
    return () => { cancelled = true; };
  }, [setTokens, clearTokens]);

  const handleSignup = async (data: { email: string; password: string; fullName: string; telephone: string; idNumber: string; pfNumber: string; branch: string; role: UserRole; assignment?: string }) => {
    const response = await apiSignup(data as SignupRequest) as any;
    if (!response.token || !response.user) {
      throw new Error('Invalid response from server');
    }
    await setTokens(response.token, response.refreshToken);
    setCurrentUser({
      id: response.user.id,
      email: response.user.email,
      fullName: response.user.fullName,
      telephone: response.user.telephone,
      idNumber: response.user.idNumber,
      pfNumber: response.user.pfNumber,
      branch: response.user.branch,
      role: response.user.role as UserRole,
      assignment: response.user.assignment,
      isVerified: (response.user as any).isVerified ?? false,
      createdAt: response.user.createdAt,
    });
  };

  const handleLogin = async (identifier: string, password: string) => {
    const isEmail = identifier.includes('@');
    const payload = isEmail ? { email: identifier } : { phone: identifier };
    const response = await apiLogin({ ...payload, password } as any);
    if (!response.token || !response.user) {
      throw new Error('Invalid response from server');
    }
    await setTokens(response.token, response.refreshToken);
    setCurrentUser({
      id: response.user.id,
      email: response.user.email,
      fullName: response.user.fullName,
      telephone: response.user.telephone,
      idNumber: response.user.idNumber,
      pfNumber: response.user.pfNumber,
      branch: response.user.branch,
      role: response.user.role as UserRole,
      assignment: response.user.assignment,
      createdAt: response.user.createdAt,
    });
  };

  const handleOtpLogin = async (target: string, mode: 'email' | 'phone', token?: string, user?: AppUser) => {
    if (token && user) {
      const storedRefresh = await tokenStore.getItem(REFRESH_TOKEN_KEY);
      await setTokens(token, storedRefresh || undefined);
      setCurrentUser({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        telephone: user.telephone,
        idNumber: user.idNumber,
        pfNumber: user.pfNumber,
        branch: user.branch,
        role: user.role as UserRole,
        assignment: user.assignment,
        createdAt: user.createdAt,
      });
      return;
    }

    const res = await fetch(`${API_BASE_URL}/api/auth/otp-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [mode]: target }),
    });
    const data = await res.json();
    if (!res.ok || !data.token || !data.user) {
      throw new Error(data.error || 'OTP login failed');
    }
    await setTokens(data.token, data.refreshToken);
    setCurrentUser({
      id: data.user.id,
      email: data.user.email,
      fullName: data.user.fullName,
      telephone: data.user.telephone,
      idNumber: data.user.idNumber,
      pfNumber: data.user.pfNumber,
      branch: data.user.branch,
      role: data.user.role as UserRole,
      assignment: data.user.assignment,
      createdAt: data.user.createdAt,
    });
  };

  const refreshToken = useCallback(async (): Promise<boolean> => {
    const storedRefresh = await tokenStore.getItem(REFRESH_TOKEN_KEY);
    if (!storedRefresh) return false;
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: storedRefresh }),
      });
      const data = await response.json();
      if (!response.ok || !data.token) {
        await clearTokens();
        return false;
      }
      await setTokens(data.token, data.refreshToken);
      return true;
    } catch {
      return false;
    }
  }, [accessToken, setTokens, clearTokens]);

  const handleLogout = async () => {
    try {
      if (accessToken) {
        await fetch(`${API_BASE_URL}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        });
      }
    } catch {
      // best-effort
    }
    await clearTokens();
  };

  const canApproveLoans = hasAccess(currentUser?.role || '', 'officer');
  const canDeleteRecords = hasAccess(currentUser?.role || '', 'supervisor');
  const canViewAll = hasAccess(currentUser?.role || '', 'supervisor');
  const canManageUsers = hasAccess(currentUser?.role || '', 'manager');
  const canSuspendUsers = hasAccess(currentUser?.role || '', 'manager');
  const canAdjustLoanLimits = hasAccess(currentUser?.role || '', 'manager');
  const canViewAuditLogs = hasAccess(currentUser?.role || '', 'supervisor');
  const canTriggerReviews = hasAccess(currentUser?.role || '', 'supervisor');

  const suspendUser = async (userId: string, reason: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/users/suspend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ userId, reason }),
      });
      const data = await response.json();
      return response.ok;
    } catch {
      return false;
    }
  };

  const unsuspendUser = async (userId: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/users/unsuspend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ userId }),
      });
      const data = await response.json();
      return response.ok;
    } catch {
      return false;
    }
  };

  const deleteUser = async (userId: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/users/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ userId }),
      });
      const data = await response.json();
      return response.ok;
    } catch {
      return false;
    }
  };

  return (
    <AuthContext.Provider value={{ currentUser, accessToken, canApproveLoans, canDeleteRecords, canViewAll, canManageUsers, canSuspendUsers, canAdjustLoanLimits, canViewAuditLogs, canTriggerReviews, isLoading, signup: handleSignup, login: handleLogin, otpLogin: handleOtpLogin, refreshToken, logout: handleLogout, suspendUser, unsuspendUser, deleteUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}