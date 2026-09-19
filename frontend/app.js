/* Live Poll frontend: plain JavaScript, no build step.
   All server data is written to the page with textContent / createElement,
   never innerHTML, so poll text cannot inject markup. */
"use strict";

const API_BASE = "http://localhost:8080";

const TOKEN_KEY = "token";
const USER_KEY = "user";
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 10;

const state = {
  token: null,
  user: null,
  authMode: "login",

  polls: [],
  hasLoadedPolls: false,
  loadingPolls: false,
  loadError: "",
  lastLoadedAt: 0,

  selected: {},       // pollId -> option id picked but not yet submitted
  voting: {},         // pollId -> true while a vote request is in flight
  pollStatus: {},     // pollId -> { type: "success" | "error" | "info", text }
  previousVotes: {},  // "pollId:optionId" -> votes at last render (to highlight increases)
  previousPct: {},    // "pollId:optionId" -> percentage at last render (to animate bars)
};

let loadSeq = 0;        // lets a newer poll request win over an older, slower one
let toastTimer = null;
let optionCounter = 0;  // unique ids for the create-form option inputs

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2), value);
    } else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
}

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable: session lasts until reload */ }
}
function storageRemove(key) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function plural(count, word) {
  return count === 1 ? word : word + "s";
}

function showMessage(box, text) {
  box.textContent = text;
  box.hidden = false;
}

function hideMessage(box) {
  box.textContent = "";
  box.hidden = true;
}

// Swaps a button's label while a request runs and restores it afterwards.
function setBusy(button, busy, busyLabel) {
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = busyLabel;
  } else if (button.dataset.label) {
    button.textContent = button.dataset.label;
  }
  button.disabled = busy;
  button.setAttribute("aria-busy", String(busy));
}

function announce(text) {
  const region = $("announcer");
  region.textContent = "";
  setTimeout(() => { region.textContent = text; }, 50);
}

function showToast(text, type = "success") {
  const toast = $("toast");
  toast.textContent = text;
  toast.dataset.type = type;
  toast.hidden = false;
  announce(text);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4500);
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/* ------------------------------------------------------------------ */
/* API layer                                                           */
/* ------------------------------------------------------------------ */

class ApiError extends Error {
  constructor(status, serverMessage, isNetwork = false) {
    super(serverMessage || (isNetwork ? "Network error" : "Request failed"));
    this.status = status;
    this.serverMessage = serverMessage || "";
    this.isNetwork = isNetwork;
  }
}

function extractServerMessage(data) {
  if (!data || typeof data !== "object") return "";
  if (typeof data.error === "string") return data.error;
  if (data.error && typeof data.error.message === "string") return data.error.message;
  if (typeof data.message === "string") return data.message;
  return "";
}

// Builds the URL, adds JSON and Authorization headers, parses the response,
// and turns any failure into an ApiError. Pass { auth: false } for public endpoints.
async function apiRequest(path, { method = "GET", body, auth = true } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && state.token) headers.Authorization = "Bearer " + state.token;

  let response;
  try {
    response = await fetch(API_BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    setBackendStatus("offline");
    throw new ApiError(0, "", true);
  }

  setBackendStatus("online");

  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }

  if (!response.ok) {
    // A 401 on a request that carried our token means the token is no longer valid.
    if (response.status === 401 && auth && state.token) expireSession();
    throw new ApiError(response.status, extractServerMessage(data));
  }
  return data;
}

// Only short, plain validation messages from the server are shown to people.
function safeServerMessage(message) {
  const text = (message || "").trim();
  if (!text || text.length > 140) return "";
  if (/[{}[\]]|mongo|redis|panic|stack|exception|goroutine|e11000/i.test(text)) return "";
  return text;
}

function friendlyError(err, context) {
  if (err.isNetwork) {
    return "Unable to connect to the server. Make sure the backend is running.";
  }
  switch (err.status) {
    case 400:
    case 422:
      return safeServerMessage(err.serverMessage) || "Please check what you entered and try again.";
    case 401:
      return context === "login" ? "Invalid email or password." : "Please log in to continue.";
    case 403:
      return "You don't have permission to do that.";
    case 404:
      return context === "vote"
        ? "This poll or option no longer exists. Refresh the list and try again."
        : "We couldn't find what you asked for.";
    case 409:
      if (context === "vote") return "You have already voted in this poll.";
      if (context === "signup") return "An account with this email already exists. Try logging in.";
      return "That conflicts with existing data. Please try again.";
    case 429:
      return "Too many requests. Wait a moment and try again.";
    default:
      return "Something went wrong on the server. Please try again in a moment.";
  }
}

/* ------------------------------------------------------------------ */
/* Server status indicator (header)                                    */
/* ------------------------------------------------------------------ */

const STATUS_TEXT = {
  checking: "Checking server",
  online: "Server online",
  degraded: "Server degraded",
  offline: "Server offline",
};

function setBackendStatus(status) {
  $("backend-status").dataset.state = status;
  $("backend-status-text").textContent = STATUS_TEXT[status];
}

async function checkHealth() {
  try {
    const response = await fetch(API_BASE + "/healthz", { headers: { Accept: "application/json" } });
    setBackendStatus(response.ok ? "online" : "degraded");
  } catch {
    setBackendStatus("offline");
  }
}

/* ------------------------------------------------------------------ */
/* Authentication                                                      */
/* ------------------------------------------------------------------ */

function restoreSession() {
  const token = storageGet(TOKEN_KEY);
  if (!token) {
    storageRemove(USER_KEY);
    return;
  }
  let user = null;
  try { user = JSON.parse(storageGet(USER_KEY) || "null"); } catch { user = null; }
  state.token = token;
  state.user = user && typeof user === "object" ? user : { name: "Your account" };
}

function clearSession() {
  storageRemove(TOKEN_KEY);
  storageRemove(USER_KEY);
  state.token = null;
  state.user = null;
  state.selected = {};
  state.pollStatus = {};
  state.voting = {};
}

function expireSession() {
  clearSession();
  updateAuthUI();
  setAuthMode("login");
  showToast("Your session has expired. Please log in again.", "error");
}

function completeAuth(data) {
  if (!data || typeof data.token !== "string" || !data.token || !data.user) {
    throw new ApiError(500, "");
  }
  state.token = data.token;
  state.user = data.user;
  storageSet(TOKEN_KEY, data.token);
  storageSet(USER_KEY, JSON.stringify(data.user));
  updateAuthUI();
  loadPolls({ silent: true });
  $("polls-heading").focus({ preventScroll: true });
}

function setAuthMode(mode) {
  state.authMode = mode;
  const isLogin = mode === "login";
  $("tab-login").setAttribute("aria-selected", String(isLogin));
  $("tab-login").tabIndex = isLogin ? 0 : -1;
  $("tab-signup").setAttribute("aria-selected", String(!isLogin));
  $("tab-signup").tabIndex = isLogin ? -1 : 0;
  $("login-form").hidden = !isLogin;
  $("signup-form").hidden = isLogin;
}

// Used by the "Log in" link on a poll: bring the account form into view.
function openAuthPanel(mode = "login") {
  if (state.token) return;
  setAuthMode(mode);
  $("auth-panel").scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  $(mode === "login" ? "login-email" : "signup-name").focus({ preventScroll: true });
}

async function login(event) {
  event.preventDefault();
  const email = $("login-email").value.trim();
  const password = $("login-password").value;
  const errorBox = $("login-error");
  const button = $("login-submit");
  hideMessage(errorBox);

  if (!isValidEmail(email)) return showMessage(errorBox, "Enter a valid email address.");
  if (!password) return showMessage(errorBox, "Enter your password.");

  setBusy(button, true, "Signing in...");
  try {
    const data = await apiRequest("/api/auth/login", { method: "POST", body: { email, password }, auth: false });
    completeAuth(data);
    $("login-form").reset();
  } catch (err) {
    showMessage(errorBox, friendlyError(err, "login"));
  } finally {
    setBusy(button, false);
  }
}

async function signup(event) {
  event.preventDefault();
  const name = $("signup-name").value.trim();
  const email = $("signup-email").value.trim();
  const password = $("signup-password").value;
  const errorBox = $("signup-error");
  const button = $("signup-submit");
  hideMessage(errorBox);

  if (name.length < 2) return showMessage(errorBox, "Enter your name (at least 2 characters).");
  if (!isValidEmail(email)) return showMessage(errorBox, "Enter a valid email address.");
  if (password.length < 8) return showMessage(errorBox, "Use a password with at least 8 characters.");

  setBusy(button, true, "Creating account...");
  try {
    const data = await apiRequest("/api/auth/signup", { method: "POST", body: { name, email, password }, auth: false });
    completeAuth(data);
    $("signup-form").reset();
  } catch (err) {
    showMessage(errorBox, friendlyError(err, "signup"));
  } finally {
    setBusy(button, false);
  }
}

function logout() {
  clearSession();
  updateAuthUI();
  setAuthMode("login");
  $("tab-login").focus({ preventScroll: true });
  showToast("You have been logged out.");
}

function updateAuthUI() {
  const loggedIn = Boolean(state.token);
  document.body.dataset.auth = loggedIn ? "in" : "out";
  $("auth-panel").hidden = loggedIn;
  $("create-panel").hidden = !loggedIn;
  $("user-info").hidden = !loggedIn;
  if (loggedIn) {
    $("user-name").textContent = (state.user && state.user.name) || "Your account";
    $("user-email").textContent = (state.user && state.user.email) || "";
  }
  renderPolls(); // the vote controls depend on whether someone is logged in
}

/* ------------------------------------------------------------------ */
/* Votes remembered in this browser                                    */
/* ------------------------------------------------------------------ */
/* The API does not say which polls a user has voted in, so we remember it
   locally to show "Your vote" and disable the button. The backend still
   enforces one vote per user and answers 409 if we get it wrong. */

function votesKey() {
  const id = state.user && (state.user.id || state.user.email);
  return id ? "votes:" + id : null;
}

function getVotedMap() {
  const key = votesKey();
  if (!key) return {};
  try {
    const map = JSON.parse(storageGet(key) || "{}");
    return map && typeof map === "object" ? map : {};
  } catch {
    return {};
  }
}

function rememberVote(pollId, optionId) {
  const key = votesKey();
  if (!key) return;
  const map = getVotedMap();
  map[pollId] = optionId || "";
  storageSet(key, JSON.stringify(map));
}

/* ------------------------------------------------------------------ */
/* Loading polls                                                       */
/* ------------------------------------------------------------------ */

function normalizePolls(data) {
  const raw = data && Array.isArray(data.polls) ? data.polls : [];
  return raw
    .filter((p) => p && p.id && Array.isArray(p.options) && p.is_active !== false)
    .map((p) => ({
      id: String(p.id),
      question: String(p.question || "Untitled poll"),
      createdAt: p.created_at || "",
      options: p.options
        .filter((o) => o && o.id !== undefined && o.id !== null)
        .map((o) => ({ id: String(o.id), text: String(o.text ?? ""), votes: Number(o.votes) || 0 })),
    }));
}

// silent = refresh in the background without replacing the list with a loading message.
async function loadPolls({ silent = false } = {}) {
  const seq = ++loadSeq;
  state.loadingPolls = true;
  if (!state.hasLoadedPolls) state.loadError = "";
  if (!silent || !state.hasLoadedPolls) renderPolls();
  updateRefreshButton();

  try {
    const data = await apiRequest("/api/polls/active", { auth: false });
    if (seq !== loadSeq) return;
    state.polls = normalizePolls(data);
    state.hasLoadedPolls = true;
    state.loadError = "";
    state.lastLoadedAt = Date.now();
  } catch (err) {
    if (seq !== loadSeq) return;
    state.loadError = friendlyError(err, "polls");
  } finally {
    if (seq === loadSeq) {
      state.loadingPolls = false;
      renderPolls();
      updateRefreshButton();
    }
  }
}

function updateRefreshButton() {
  const button = $("refresh-btn");
  button.disabled = state.loadingPolls;
  button.textContent = state.loadingPolls ? "Refreshing..." : "Refresh";
}

/* ------------------------------------------------------------------ */
/* Rendering polls                                                     */
/* ------------------------------------------------------------------ */

function stateBox(title, hint, actionLabel, onAction) {
  return el(
    "div",
    { class: "state", role: actionLabel ? "alert" : "status" },
    el("p", { class: "state-title", text: title }),
    hint ? el("p", { class: "state-hint", text: hint }) : null,
    actionLabel ? el("button", { type: "button", class: "btn btn-secondary", onclick: onAction, text: actionLabel }) : null
  );
}

function renderPolls() {
  const list = $("polls-list");
  const notice = $("polls-notice");
  const active = document.activeElement;
  const focusKey = active && active.dataset ? active.dataset.focusKey : "";

  list.replaceChildren();
  list.setAttribute("aria-busy", String(state.loadingPolls && !state.hasLoadedPolls));

  // A failed refresh keeps the polls already on screen and explains above them.
  if (state.loadError && state.hasLoadedPolls) showMessage(notice, state.loadError);
  else hideMessage(notice);

  if (!state.hasLoadedPolls) {
    if (state.loadError) {
      list.append(stateBox("Couldn't load polls", state.loadError, "Try again", () => loadPolls()));
    } else {
      list.append(stateBox("Loading polls..."));
    }
  } else if (state.polls.length === 0) {
    list.append(stateBox(
      "No active polls yet.",
      state.token ? "Use the form to create the first one." : "Log in or sign up to create the first one."
    ));
  } else {
    state.polls.forEach((poll) => list.append(createPollCard(poll)));
  }

  $("updated-at").textContent = state.lastLoadedAt
    ? "Updated " + new Date(state.lastLoadedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "";

  // Rebuilding the list would drop keyboard focus, so put it back.
  if (focusKey) {
    const same = list.querySelector('[data-focus-key="' + CSS.escape(focusKey) + '"]');
    if (same && !same.disabled) same.focus({ preventScroll: true });
  }
}

function createPollCard(poll) {
  const pid = poll.id;
  const safeId = pid.replace(/[^\w-]/g, "");
  const totalVotes = poll.options.reduce((sum, option) => sum + option.votes, 0);

  const votedMap = getVotedMap();
  const hasVoted = Object.prototype.hasOwnProperty.call(votedMap, pid);
  const votedOptionId = hasVoted ? votedMap[pid] || null : null;
  const submitting = Boolean(state.voting[pid]);
  const locked = hasVoted || submitting;
  const selectedId = hasVoted ? votedOptionId : state.selected[pid] || null;

  const legend = el("legend", { class: "sr-only", text: "Options for: " + poll.question });
  const fieldset = el("fieldset", { class: "options" }, legend);

  poll.options.forEach((option) => {
    const key = pid + ":" + option.id;
    const pct = totalVotes ? Math.round((option.votes / totalVotes) * 100) : 0;
    const isSelected = selectedId === option.id;
    const isMine = hasVoted && votedOptionId === option.id;

    const input = el("input", {
      type: "radio",
      name: "poll-" + safeId,
      value: option.id,
      "data-focus-key": "option:" + key,
    });
    input.checked = isSelected;
    input.disabled = locked;
    input.addEventListener("change", () => {
      state.selected[pid] = option.id;
      delete state.pollStatus[pid];
      renderPolls();
    });

    // Start the bar at its previous width so a refresh animates only the change.
    const bar = el("span", { class: "option-bar", "aria-hidden": "true" });
    bar.style.width = (state.previousPct[key] ?? 0) + "%";
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = pct + "%"; }));

    const bumped = state.previousVotes[key] !== undefined && option.votes > state.previousVotes[key];
    state.previousVotes[key] = option.votes;
    state.previousPct[key] = pct;

    const label = el(
      "label",
      { class: "option" + (isSelected ? " is-selected" : "") + (isMine ? " is-voted" : "") + (locked ? " is-locked" : "") },
      input,
      bar,
      el("span", { class: "option-mark", "aria-hidden": "true" }),
      el("span", { class: "option-text" }, option.text, isMine ? el("span", { class: "option-tag", text: "Your vote" }) : null),
      el(
        "span",
        { class: "option-figures" },
        el("span", { class: "option-count" + (bumped ? " is-bumped" : "") },
          el("strong", { text: String(option.votes) }), " " + plural(option.votes, "vote")),
        el("span", { class: "option-pct", text: pct + "%" })
      )
    );
    fieldset.append(label);
  });

  const voteButton = el("button", { type: "submit", class: "btn btn-primary", "data-focus-key": "vote:" + pid });
  voteButton.textContent = hasVoted ? "Voted" : submitting ? "Submitting vote..." : "Vote";
  voteButton.disabled = locked;
  if (submitting) voteButton.setAttribute("aria-busy", "true");

  const footer = el(
    "div",
    { class: "poll-footer" },
    el("p", { class: "poll-total" }, "Total votes: ", el("strong", { text: String(totalVotes) })),
    voteButton
  );

  // One line under the vote button: the latest outcome, or a plain hint.
  let status = state.pollStatus[pid];
  let loginLink = null;
  if (!status && hasVoted) status = { type: "info", text: "You have voted in this poll." };
  if (!status && !state.token) {
    status = { type: "info", text: "Log in or sign up to vote. " };
    loginLink = el("button", { type: "button", class: "link-button", text: "Log in", onclick: () => openAuthPanel("login") });
  }
  const statusLine = status
    ? el("p", { class: "poll-status is-" + status.type }, status.text, loginLink)
    : null;

  const form = el("form", { novalidate: true }, fieldset, footer, statusLine);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    vote(pid);
  });

  const created = formatDate(poll.createdAt);
  return el(
    "article",
    { class: "poll", "aria-labelledby": "question-" + safeId },
    el("h3", { class: "poll-question", id: "question-" + safeId, text: poll.question }),
    created ? el("p", { class: "poll-meta", text: "Created " + created }) : null,
    form
  );
}

/* ------------------------------------------------------------------ */
/* Voting                                                              */
/* ------------------------------------------------------------------ */

function setPollStatus(pollId, type, text) {
  state.pollStatus[pollId] = { type, text };
  announce(text);
}

async function vote(pollId) {
  if (state.voting[pollId]) return; // ignore double clicks while a request is running
  if (!state.polls.some((poll) => poll.id === pollId)) return;

  if (!state.token) {
    setPollStatus(pollId, "error", "Log in or sign up to vote.");
    renderPolls();
    openAuthPanel("login");
    return;
  }

  const optionId = state.selected[pollId];
  if (!optionId) {
    setPollStatus(pollId, "error", "Select an option before voting.");
    renderPolls();
    return;
  }

  state.voting[pollId] = true;
  setPollStatus(pollId, "info", "Submitting vote...");
  renderPolls();

  let succeeded = false;
  try {
    // optionId is the id the backend sent for this option; the frontend never invents one.
    await apiRequest("/api/polls/" + encodeURIComponent(pollId) + "/vote", {
      method: "POST",
      body: { option_id: optionId },
    });
    succeeded = true;
    rememberVote(pollId, optionId);
    delete state.selected[pollId];
    setPollStatus(pollId, "success", "Vote recorded. Thank you!");
  } catch (err) {
    if (err.status === 409) rememberVote(pollId, null); // already voted: lock the poll
    setPollStatus(pollId, "error", friendlyError(err, "vote"));
  } finally {
    delete state.voting[pollId];
    renderPolls();
  }

  // Pull fresh counts so the result bars reflect this vote and anyone else's.
  if (succeeded || state.pollStatus[pollId]?.type === "error") await loadPolls({ silent: true });
}

/* ------------------------------------------------------------------ */
/* Creating a poll                                                     */
/* ------------------------------------------------------------------ */

function optionRows() {
  return Array.from($("option-inputs").children);
}

function addOptionRow(value = "") {
  if (optionRows().length >= MAX_OPTIONS) return null;
  optionCounter += 1;
  const inputId = "option-input-" + optionCounter;

  const label = el("label", { class: "sr-only", for: inputId });
  const input = el("input", { id: inputId, type: "text", maxlength: "100", autocomplete: "off" });
  input.value = value;
  const remove = el("button", { type: "button", class: "btn btn-secondary btn-icon", text: "\u00d7" });

  const row = el("div", { class: "option-row" }, label, input, remove);
  remove.addEventListener("click", () => {
    const index = optionRows().indexOf(row);
    row.remove();
    syncOptionRows();
    const rows = optionRows();
    rows[Math.min(index, rows.length - 1)].querySelector("input").focus();
  });

  $("option-inputs").append(row);
  syncOptionRows();
  return input;
}

// Keeps labels, placeholders and the add/remove buttons correct after any change.
function syncOptionRows() {
  const rows = optionRows();
  rows.forEach((row, index) => {
    const number = index + 1;
    row.querySelector("label").textContent = "Option " + number;
    row.querySelector("input").placeholder = "Option " + number;
    const remove = row.querySelector("button");
    remove.setAttribute("aria-label", "Remove option " + number);
    remove.disabled = rows.length <= MIN_OPTIONS;
  });
  $("add-option-btn").disabled = rows.length >= MAX_OPTIONS;
}

function resetCreateForm() {
  $("poll-question").value = "";
  $("option-inputs").replaceChildren();
  for (let i = 0; i < MIN_OPTIONS; i += 1) addOptionRow();
}

async function createPoll(event) {
  event.preventDefault();
  const errorBox = $("create-error");
  const button = $("create-submit");
  hideMessage(errorBox);

  if (!state.token) return showMessage(errorBox, "Please log in to continue.");

  const question = $("poll-question").value.trim();
  const options = optionRows().map((row) => row.querySelector("input").value.trim());

  if (!question) return showMessage(errorBox, "Enter a question for your poll.");
  const emptyIndex = options.findIndex((text) => !text);
  if (emptyIndex !== -1) {
    return showMessage(errorBox, "Option " + (emptyIndex + 1) + " is empty. Fill it in or remove it.");
  }
  if (new Set(options.map((text) => text.toLowerCase())).size !== options.length) {
    return showMessage(errorBox, "Each option must be different.");
  }

  setBusy(button, true, "Creating poll...");
  try {
    await apiRequest("/api/polls", { method: "POST", body: { question, options } });
    resetCreateForm();
    showToast("Poll created successfully.");
    loadPolls({ silent: true });
  } catch (err) {
    showMessage(errorBox, friendlyError(err, "create"));
  } finally {
    setBusy(button, false);
  }
}

/* ------------------------------------------------------------------ */
/* Start-up                                                            */
/* ------------------------------------------------------------------ */

function bindTabs() {
  const tabs = [$("tab-login"), $("tab-signup")];
  $("tab-login").addEventListener("click", () => setAuthMode("login"));
  $("tab-signup").addEventListener("click", () => setAuthMode("signup"));
  tabs.forEach((tab) => {
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const next = state.authMode === "login" ? "signup" : "login";
      setAuthMode(next);
      $(next === "login" ? "tab-login" : "tab-signup").focus();
    });
  });
}

function init() {
  restoreSession();

  $("login-form").addEventListener("submit", login);
  $("signup-form").addEventListener("submit", signup);
  $("create-form").addEventListener("submit", createPoll);
  $("logout-btn").addEventListener("click", logout);
  $("refresh-btn").addEventListener("click", () => loadPolls({ silent: true }));
  $("add-option-btn").addEventListener("click", () => {
    const input = addOptionRow();
    if (input) input.focus();
  });
  bindTabs();

  resetCreateForm();
  setAuthMode("login");
  updateAuthUI();
  checkHealth();
  loadPolls();

  // Coming back to the tab refreshes the counts once (this is not a timer).
  document.addEventListener("visibilitychange", () => {
    const stale = Date.now() - state.lastLoadedAt > 3000;
    if (document.visibilityState === "visible" && state.hasLoadedPolls && stale) {
      loadPolls({ silent: true });
    }
  });
}

init();