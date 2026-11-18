import { writable, get } from 'svelte/store';
import { getToken } from './api.js';

export type Theme = 'light' | 'dark';

export interface ThemeSchedule {
  enabled: boolean;
  darkHours: boolean[]; // length 24, index = hour of day, true = dark mode for that hour
}

function defaultDarkHours(): boolean[] {
  // Default: dark from 20:00 to 06:59
  return Array.from({ length: 24 }, (_, h) => h >= 20 || h < 7);
}

const defaultSchedule: ThemeSchedule = { enabled: false, darkHours: defaultDarkHours() };

// Use system preference as fallback
const prefersDark = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)').matches : false;
const initialTheme = (prefersDark ? 'dark' : 'light') as Theme;

export const theme = writable<Theme>(initialTheme);
export const themeSchedule = writable<ThemeSchedule>(defaultSchedule);

let isInitialized = false;

function computeScheduledTheme(s: ThemeSchedule): Theme {
  const hour = new Date().getHours();
  return s.darkHours[hour] ? 'dark' : 'light';
}

function applySchedule(s: ThemeSchedule) {
  if (s.enabled) {
    theme.set(computeScheduledTheme(s));
  }
}

// Apply theme to DOM only (no saving during init)
theme.subscribe((t: Theme) => {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', t);
  }
  // Save only after initialization is complete
  if (isInitialized) {
    saveThemePreferences(t, get(themeSchedule));
  }
});

themeSchedule.subscribe((s: ThemeSchedule) => {
  applySchedule(s);
  // Save only after initialization is complete
  if (isInitialized) {
    saveThemePreferences(get(theme), s);
  }
});

// Load theme prefs from backend if authenticated
export async function loadThemePreferences() {
  const token = getToken();
  if (!token) {
    isInitialized = true;
    return;
  }

  try {
    const res = await fetch('/api/auth/theme', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (res.ok) {
      const data = await res.json();
      const newTheme = (data.theme || 'light') as Theme;
      const newSchedule = data.themeSchedule || defaultSchedule;

      // Update stores without triggering saves
      theme.set(newTheme);
      themeSchedule.set(newSchedule);
    }
  } catch (e) {
    console.error('Failed to load theme preferences:', e);
  } finally {
    isInitialized = true;
  }
}

// Save theme prefs to backend
export async function saveThemePreferences(t?: Theme, s?: ThemeSchedule) {
  const token = getToken();
  if (!token) return;

  const currentTheme = t || get(theme);
  const currentSchedule = s || get(themeSchedule);

  try {
    await fetch('/api/auth/theme', {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        theme: currentTheme,
        themeSchedule: currentSchedule
      })
    });
  } catch (e) {
    console.error('Failed to save theme preferences:', e);
  }
}

if (typeof window !== 'undefined') {
  setInterval(() => applySchedule(get(themeSchedule)), 60 * 1000);
}
