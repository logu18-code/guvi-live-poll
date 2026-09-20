// Everything that talks to the Go/Gin backend. Endpoints and payloads are unchanged.

// Vite bakes VITE_API_BASE in at build time. Without it, the production backend is used.
export const API_BASE = (import.meta.env.VITE_API_BASE || "https://guvi-live-poll-backend.onrender.com").replace(/\/+$/, "");

export class ApiError extends Error {
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

// Adds JSON and Authorization headers, parses the response, and turns any failure
// into an ApiError. Pass a token only for endpoints that need one.
export async function apiRequest(path, { method = "GET", body, token } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = "Bearer " + token;

  let response;
  try {
    response = await fetch(API_BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "", true);
  }

  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }

  if (!response.ok) throw new ApiError(response.status, extractServerMessage(data));
  return data;
}

export async function checkHealth() {
  try {
    const response = await fetch(API_BASE + "/healthz", { headers: { Accept: "application/json" } });
    return response.ok ? "online" : "degraded";
  } catch {
    return "offline";
  }
}

// Only short, plain validation messages from the server are shown to people.
function safeServerMessage(message) {
  const text = (message || "").trim();
  if (!text || text.length > 140) return "";
  if (/[{}[\]]|mongo|redis|panic|stack|exception|goroutine|e11000/i.test(text)) return "";
  return text;
}

export function friendlyError(err, context) {
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

export function normalizePolls(data) {
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
