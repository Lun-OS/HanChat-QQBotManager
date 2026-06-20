import { useEffect, useState, useCallback } from 'react';

const APPEARANCE_KEY = 'appearance_settings';

export const PERFORMANCE_MODE_ATTR = 'data-performance-mode';

type AppearanceData = {
  reduceMotion?: boolean;
  [key: string]: unknown;
};

function readAppearanceData(): AppearanceData {
  try {
    const raw = localStorage.getItem(APPEARANCE_KEY);
    if (raw) return JSON.parse(raw) as AppearanceData;
  } catch {
    // ignore
  }
  return {};
}

function writeAppearanceData(data: AppearanceData) {
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

function applyAttribute(value: boolean) {
  if (typeof document === 'undefined') return;
  if (value) {
    document.documentElement.setAttribute(PERFORMANCE_MODE_ATTR, 'true');
  } else {
    document.documentElement.removeAttribute(PERFORMANCE_MODE_ATTR);
  }
}

const subscribers = new Set<(v: boolean) => void>();
let currentValue: boolean | null = null;

function syncFromStorage() {
  const data = readAppearanceData();
  const value = data.reduceMotion === true;
  if (currentValue !== value) {
    currentValue = value;
    applyAttribute(value);
    subscribers.forEach((cb) => cb(value));
  }
}

function ensureInitialized() {
  if (currentValue === null && typeof window !== 'undefined') {
    syncFromStorage();
    window.addEventListener('storage', (e) => {
      if (e.key === APPEARANCE_KEY) {
        syncFromStorage();
      }
    });
  }
}

/**
 * 性能模式（减少动画）开关。
 * - 持久化到 localStorage 的 appearance_settings.reduceMotion
 * - 在 <html> 上设置 data-performance-mode="true"，供 CSS 降级使用
 * - 多个组件共享同一份状态
 */
export function usePerformanceMode(): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState<boolean>(() => {
    ensureInitialized();
    return currentValue ?? false;
  });

  useEffect(() => {
    ensureInitialized();
    setValue(currentValue ?? false);
    const cb = (v: boolean) => setValue(v);
    subscribers.add(cb);
    return () => {
      subscribers.delete(cb);
    };
  }, []);

  const setReduceMotion = useCallback((next: boolean) => {
    const data = readAppearanceData();
    data.reduceMotion = next;
    writeAppearanceData(data);
    currentValue = next;
    applyAttribute(next);
    subscribers.forEach((cb) => cb(next));
  }, []);

  return [value, setReduceMotion];
}

export function getPerformanceMode(): boolean {
  ensureInitialized();
  return currentValue === true;
}
