import type { ThemePreference } from '../types';

export function resolveThemePreference(
  themePreference: ThemePreference,
  systemTheme: 'dark' | 'light',
): 'dark' | 'light' {
  if (themePreference === 'system') return systemTheme;
  return themePreference;
}
