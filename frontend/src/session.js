// Login session and "which polls I voted in" are kept in localStorage.
// The key names are the same as the plain-JS version, so existing sessions keep working.
import { storageGet, storageRemove, storageSet } from "./utils.js";

const TOKEN_KEY = "token";
const USER_KEY = "user";

export function loadSession() {
  const token = storageGet(TOKEN_KEY);
  if (!token) {
    storageRemove(USER_KEY);
    return null;
  }
  let user = null;
  try { user = JSON.parse(storageGet(USER_KEY) || "null"); } catch { user = null; }
  return { token, user: user && typeof user === "object" ? user : { name: "Your account" } };
}

export function saveSession(token, user) {
  storageSet(TOKEN_KEY, token);
  storageSet(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  storageRemove(TOKEN_KEY);
  storageRemove(USER_KEY);
}

/* The API does not say which polls a user has voted in, so the browser remembers it
   to show "Your vote" and lock the poll. The backend still enforces one vote per
   user and answers 409 if this is ever wrong. */

export function votesKey(user) {
  const id = user && (user.id || user.email);
  return id ? "votes:" + id : null;
}

export function readVotedMap(user) {
  const key = votesKey(user);
  if (!key) return {};
  try {
    const map = JSON.parse(storageGet(key) || "{}");
    return map && typeof map === "object" ? map : {};
  } catch {
    return {};
  }
}

// Saves the vote and returns the updated map.
export function rememberVote(user, pollId, optionId) {
  const key = votesKey(user);
  if (!key) return {};
  const map = readVotedMap(user);
  map[pollId] = optionId || "";
  storageSet(key, JSON.stringify(map));
  return map;
}
