import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiRequest, friendlyError, normalizePolls } from "./api.js";

// Returns a stable request(path, options) function that:
//  - attaches the login token (unless options.auth === false),
//  - reports whether the server answered (online) or not (offline),
//  - logs the user out if the server rejects their token (401).
export function useApi(token, onStatus, onExpired) {
  const latest = useRef({ token, onStatus, onExpired });
  useEffect(() => {
    latest.current = { token, onStatus, onExpired };
  });

  return useCallback(async (path, options = {}) => {
    const { auth = true, ...rest } = options;
    const current = latest.current;
    const sentToken = auth ? current.token : null;
    try {
      const data = await apiRequest(path, { ...rest, token: sentToken });
      current.onStatus("online");
      return data;
    } catch (err) {
      if (err instanceof ApiError) {
        current.onStatus(err.isNetwork ? "offline" : "online");
        if (err.status === 401 && sentToken) current.onExpired();
      }
      throw err;
    }
  }, []);
}

// Loads the active polls. A newer request always wins over an older, slower one.
// Also refreshes once when you come back to the tab (this is not a timer).
export function usePolls(request) {
  const [polls, setPolls] = useState([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastLoadedAt, setLastLoadedAt] = useState(0);
  const seq = useRef(0);
  const loadedRef = useRef(false);
  const lastRef = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    if (!loadedRef.current) setError("");
    try {
      const data = await request("/api/polls/active", { auth: false });
      if (mine !== seq.current) return;
      loadedRef.current = true;
      lastRef.current = Date.now();
      setPolls(normalizePolls(data));
      setHasLoaded(true);
      setError("");
      setLastLoadedAt(lastRef.current);
    } catch (err) {
      if (mine !== seq.current) return;
      setError(friendlyError(err, "polls"));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    function onVisible() {
      const stale = Date.now() - lastRef.current > 3000;
      if (document.visibilityState === "visible" && loadedRef.current && stale) reload();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  return { polls, hasLoaded, loading, error, lastLoadedAt, reload };
}

// True for a moment after a number goes up, so the count can flash once.
export function useBump(value) {
  const previous = useRef(value);
  const [bumped, setBumped] = useState(false);

  useEffect(() => {
    if (value > previous.current) {
      previous.current = value;
      setBumped(true);
      const timer = setTimeout(() => setBumped(false), 1500);
      return () => clearTimeout(timer);
    }
    previous.current = value;
    setBumped(false);
  }, [value]);

  return bumped;
}
