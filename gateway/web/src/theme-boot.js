// Runs before React: apply the saved theme so there is no light/dark flash.
let mode = 'system';
try { mode = localStorage.getItem('abd:theme') || 'system'; } catch { /* ignore */ }
const dark = mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.dataset.theme = dark ? 'dark' : 'light';
