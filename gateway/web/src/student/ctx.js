// Student-wide context: the API client (API key or login session as bearer), the loaded account,
// navigation, and helpers shared by the panels.
import { createContext, useContext } from 'react';
import { makeApi } from '../lib/api.js';
import { store } from '../lib/store.js';
import { tokens, usd } from '../lib/format.js';

export const TOKEN_KEY = 'abd:userKey';
export const LAST_KEY = 'abd:lastApiKey';
export const api = makeApi(TOKEN_KEY, { onAuthFail: () => { store.del(TOKEN_KEY); window.dispatchEvent(new Event('abd:logout')); } });

/** Login sessions (abd_ses_…) work as bearer just like API keys, but can't be pasted into tools. */
export const isSession = () => (store.get(TOKEN_KEY) || '').startsWith('abd_ses_');
/** The key shown in the install commands / snippets. */
export const toolKey = () => (isSession() ? (store.get(LAST_KEY) || 'sk-abd-…(اعمل مفتاح من تبويب المفاتيح)') : store.get(TOKEN_KEY));

export const fmtAmount = (kind, v) => (kind === 'usd' ? usd(v) : `${tokens(v)} توكن`);

/** Navigate then focus an element by id (palette commands + onboarding steps). */
export function focusLater(id, scroll = true) {
  setTimeout(() => {
    const el = document.getElementById(id);
    if (!el) return;
    if (scroll) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus({ preventScroll: true });
  }, 380);
}

export const StudentCtx = createContext(null);
/** { me, catalog, rep, limits, reload(), reloadLimits(), go(tab), groupName(id), setAlias(alias, model_id), logout() } */
export const useStudent = () => useContext(StudentCtx);
