import { Feather } from '@expo/vector-icons';

export type Status =
  | 'pending'
  | 'approved'
  | 'declined'
  | 'disbursed'
  | 'closed'
  | 'under_review'
  | 'active'
  | 'inactive'
  | 'suspended'
  | 'manager'
  | 'supervisor'
  | 'credit_officer'
  | 'superadmin'
  | 'loan_limit'
  | 'balance'
  | 'starter'
  | 'top_up'
  | 'completed'
  | 'failed'
  | 'user'
  | 'officer'
  | 'unknown';

type StatusStyle = {
  bg: string;
  text: string;
  icon: keyof typeof Feather.glyphMap;
};

const COLORS = {
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  neutral: '#64748b',
  primary: '#6366f1',
  info: '#0ea5e9',
};

function withOpacity(hex: string, opacity: number) {
  const alpha = Math.round(opacity * 255)
    .toString(16)
    .padStart(2, '0');
  return hex + alpha;
}

export const statusConfig: Record<Status, StatusStyle> = {
  pending: { bg: withOpacity(COLORS.warning, 0.1), text: COLORS.warning, icon: 'clock' },
  approved: { bg: withOpacity(COLORS.success, 0.1), text: COLORS.success, icon: 'check-circle' },
  declined: { bg: withOpacity(COLORS.danger, 0.1), text: COLORS.danger, icon: 'x-circle' },
  disbursed: { bg: withOpacity(COLORS.success, 0.1), text: COLORS.success, icon: 'dollar-sign' },
  closed: { bg: withOpacity(COLORS.neutral, 0.1), text: COLORS.neutral, icon: 'archive' },
  under_review: { bg: withOpacity(COLORS.warning, 0.1), text: COLORS.warning, icon: 'search' },
  active: { bg: withOpacity(COLORS.success, 0.1), text: COLORS.success, icon: 'play' },
  inactive: { bg: withOpacity(COLORS.neutral, 0.1), text: COLORS.neutral, icon: 'pause' },
  suspended: { bg: withOpacity(COLORS.danger, 0.1), text: COLORS.danger, icon: 'slash' },
  manager: { bg: withOpacity(COLORS.primary, 0.1), text: COLORS.primary, icon: 'user' },
  supervisor: { bg: withOpacity(COLORS.success, 0.1), text: COLORS.success, icon: 'users' },
  credit_officer: { bg: withOpacity(COLORS.info, 0.1), text: COLORS.info, icon: 'briefcase' },
  superadmin: { bg: withOpacity(COLORS.primary, 0.1), text: COLORS.primary, icon: 'shield' },
  user: { bg: withOpacity(COLORS.primary, 0.1), text: COLORS.primary, icon: 'user' },
  officer: { bg: withOpacity(COLORS.info, 0.1), text: COLORS.info, icon: 'briefcase' },
  loan_limit: { bg: COLORS.primary, text: '#ffffff', icon: 'bar-chart' },
  balance: { bg: COLORS.primary, text: '#ffffff', icon: 'dollar-sign' },
  starter: { bg: withOpacity(COLORS.primary, 0.1), text: COLORS.primary, icon: 'star' },
  top_up: { bg: withOpacity(COLORS.danger, 0.1), text: COLORS.danger, icon: 'arrow-up' },
  completed: { bg: withOpacity(COLORS.success, 0.1), text: COLORS.success, icon: 'check' },
  failed: { bg: withOpacity(COLORS.danger, 0.1), text: COLORS.danger, icon: 'alert-circle' },
  unknown: { bg: withOpacity(COLORS.neutral, 0.1), text: COLORS.neutral, icon: 'help-circle' },
};

export const normalizeStatus = (status?: string): Status => {
  if (!status) return 'unknown';
  const normalized = status.toLowerCase().replace(/[\s-]/g, '_') as Status;
  if (!statusConfig[normalized]) {
    console.warn('Unknown status:', status);
  }
  return normalized;
};

export function getStatusStyle(status: string): StatusStyle {
  const normalized = normalizeStatus(status);

  return (
    statusConfig[normalized] ?? {
      bg: withOpacity(COLORS.neutral, 0.1),
      text: COLORS.neutral,
      icon: 'help-circle',
    }
  );
}