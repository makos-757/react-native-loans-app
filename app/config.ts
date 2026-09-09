export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  'http://localhost:8787';

export const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || '';
export const IS_TEST_BUILD = !!process.env.EXPO_PUBLIC_IS_TEST_BUILD;
export const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV || 'production';
export const APP_VERSION = '1.0.0';
export const BUILD_NUMBER = process.env.EXPO_PUBLIC_BUILD_NUMBER || '1';

export const ENV_LABEL: Record<string, string> = {
  production: 'Production',
  preview: 'Preview',
  staging: 'Staging',
};

export const ROUTES = {
  DASHBOARD: '(tabs)/index',
  USERS: '(tabs)/users',
  LOANS: '(tabs)/loans',
  REPORTS: '(tabs)/reports',
  MORE: '(tabs)/more',
  PROFILE: '(tabs)/profile',
  SETTINGS: '(tabs)/settings',
  QUALIFICATION: '(tabs)/qualification',
  AUDIT: 'audit',
  PRIVACY: '/privacy',
  LOAN_TERMS: '/loan-terms',
} as const;

export function apiUrl(path: string, params?: Record<string, string | number>): string {
  const url = new URL(API_BASE_URL + path);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
}