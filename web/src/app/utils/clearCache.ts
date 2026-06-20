import { toast } from 'sonner';

/**
 * 清除浏览器本地缓存：
 * - localStorage / sessionStorage
 * - Cache API
 * - Service Worker 注册
 * - IndexedDB 数据库
 *
 * 调用后会自动 reload，便于重新拉取最新 JS/CSS 资源。
 */
export async function clearBrowserCache(): Promise<boolean> {
  try {
    try {
      localStorage.clear();
    } catch {
      // 忽略 localStorage 清除失败
    }
    try {
      sessionStorage.clear();
    } catch {
      // 忽略 sessionStorage 清除失败
    }

    if (typeof window !== 'undefined' && 'caches' in window) {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
      } catch {
        // 忽略 Cache API 清除失败
      }
    }

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((reg) => reg.unregister()));
      } catch {
        // 忽略 Service Worker 清除失败
      }
    }

    if (typeof window !== 'undefined' && 'indexedDB' in window) {
      try {
        const databases =
          (await (indexedDB as unknown as { databases?: () => Promise<Array<{ name?: string }>> }).databases?.()) || [];
        databases.forEach((db) => {
          if (db.name) indexedDB.deleteDatabase(db.name);
        });
      } catch {
        // 忽略 IndexedDB 清除失败
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * 弹出确认框并清除浏览器缓存，成功后刷新页面。
 */
export async function confirmAndClearBrowserCache(): Promise<void> {
  const confirmed = window.confirm('确定要清除浏览器缓存吗？这将清除所有本地存储的数据和JS资源缓存。');
  if (!confirmed) return;

  const ok = await clearBrowserCache();
  if (ok) {
    toast.success('浏览器缓存已清除（包括JS资源）');
    window.location.reload();
  } else {
    toast.error('清除缓存失败');
  }
}
