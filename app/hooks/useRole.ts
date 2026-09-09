import { useAuth } from '@/context/AuthContext';
import { hasAccess, UserRole } from '@/lib/rbac';

const ROLE_MAP: Record<string, UserRole> = {
  'User': 'user',
  'Officer': 'officer',
  'Supervisor': 'supervisor',
  'Manager': 'manager',
};

export function useRole() {
  const { currentUser } = useAuth();
  const rawRole = currentUser?.role || 'user';
  const role = ROLE_MAP[rawRole] || 'user';

  return {
    role,
    rawRole,
    hasAccess: (requiredRole: UserRole) => hasAccess(role, requiredRole),
    isManager: role === 'manager',
    isSupervisor: role === 'supervisor',
    isOfficer: role === 'officer',
    isUser: role === 'user',
  };
}
