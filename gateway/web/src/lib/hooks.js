import { useCallback, useEffect, useRef, useState } from 'react';
import { store } from './store.js';

/** Load async data; returns {data, error, loading, reload, setData}. Re-runs when deps change. */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: undefined, error: null, loading: true });
  const seq = useRef(0);
  const run = useCallback(async () => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fn();
      if (id === seq.current) setState({ data, error: null, loading: false });
      return data;
    } catch (error) {
      if (id === seq.current) setState((s) => ({ ...s, error, loading: false }));
      return undefined;
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { run(); }, [run]);
  const setData = useCallback((data) => setState((s) => ({ ...s, data: typeof data === 'function' ? data(s.data) : data })), []);
  return { ...state, reload: run, setData };
}

/** useState persisted in localStorage (JSON). */
export function usePersisted(key, initial) {
  const [v, setV] = useState(() => store.json(key, initial));
  useEffect(() => { store.setJson(key, v); }, [key, v]);
  return [v, setV];
}

/** Debounced value. */
export function useDebounced(value, ms = 400) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** Wraps an async action: returns [run, busy]; errors go to onError (toast). */
export function useAction(fn, onError) {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (...a) => {
    setBusy(true);
    try { return await fn(...a); } catch (e) { onError?.(e); return undefined; } finally { setBusy(false); }
  }, [fn, onError]);
  return [run, busy];
}

/** True while the document is visible. */
export function useVisible() {
  const [v, setV] = useState(!document.hidden);
  useEffect(() => { const on = () => setV(!document.hidden); document.addEventListener('visibilitychange', on); return () => document.removeEventListener('visibilitychange', on); }, []);
  return v;
}

/** matchMedia hook. */
export function useMedia(q) {
  const [m, setM] = useState(() => matchMedia(q).matches);
  useEffect(() => { const mq = matchMedia(q); const on = () => setM(mq.matches); mq.addEventListener('change', on); return () => mq.removeEventListener('change', on); }, [q]);
  return m;
}
