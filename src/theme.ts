/** Light theme with orange primary accent. */
export const colors = {
  background: '#FFFFFF',
  backgroundSecondary: '#F7F8FA',
  card: '#FFFFFF',
  cardBorder: '#E5E7EB',

  text: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',

  primary: '#F97316',
  primaryPressed: '#EA580C',
  primaryMuted: 'rgba(249, 115, 22, 0.12)',

  success: '#16A34A',
  successMuted: 'rgba(22, 163, 74, 0.12)',
  error: '#DC2626',
  errorMuted: 'rgba(220, 38, 38, 0.12)',
  warning: '#D97706',
  warningMuted: 'rgba(217, 119, 6, 0.12)',

  border: '#E5E7EB',
  inputBg: '#F9FAFB',
  disabled: '#D1D5DB',
  overlay: 'rgba(0, 0, 0, 0.5)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const;
