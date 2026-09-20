// Small helpers shared across the app.

export function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable: session lasts until reload */ }
}

export function storageRemove(key) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function plural(count, word) {
  return count === 1 ? word : word + "s";
}

export function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
