export const ROLE_LEVEL = {
  manager: 4,
  supervisor: 3,
  officer: 2,
  user: 1,
} as const;

const ROLE_ALIASES: Record<string, keyof typeof ROLE_LEVEL> = {
  manager: 'manager',
  supervisor: 'supervisor',
  officer: 'officer',
  user: 'user',
  Manager: 'manager',
  Supervisor: 'supervisor',
  Officer: 'officer',
  User: 'user',
};

export type UserRole = keyof typeof ROLE_LEVEL;

export const normalizeRole = (role: string): UserRole => {
  return ROLE_ALIASES[role] || 'user';
};

export const hasAccess = (userRole: string, requiredRole: UserRole): boolean => {
  const normalized = normalizeRole(userRole);
  return ROLE_LEVEL[normalized] >= ROLE_LEVEL[requiredRole];
};

export const HIGHEST_ROLE: UserRole = 'manager';
