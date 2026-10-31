// Admin-wide context: the API client, live badge counts, navigation, and shared catalogs.
import { createContext, useContext } from 'react';
import { makeApi } from '../lib/api.js';
import { store } from '../lib/store.js';

export const TOKEN_KEY = 'abd:adminToken';
export const api = makeApi(TOKEN_KEY, { onAuthFail: () => { store.del(TOKEN_KEY); window.dispatchEvent(new Event('abd:logout')); } });

export const AdminCtx = createContext(null);
/** { stats, refreshStats, go(tab), groups, reloadGroups, groupName(id) } */
export const useAdmin = () => useContext(AdminCtx);
