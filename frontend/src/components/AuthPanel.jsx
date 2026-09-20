import { useEffect, useRef, useState } from "react";
import { friendlyError } from "../api.js";
import { isValidEmail, prefersReducedMotion } from "../utils.js";

function LoginForm({ hidden, request, onAuthenticated }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    const cleanEmail = email.trim();
    if (!isValidEmail(cleanEmail)) return setError("Enter a valid email address.");
    if (!password) return setError("Enter your password.");

    setBusy(true);
    try {
      const data = await request("/api/auth/login", {
        method: "POST",
        body: { email: cleanEmail, password },
        auth: false,
      });
      onAuthenticated(data);
    } catch (err) {
      setError(friendlyError(err, "login"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id="login-form" role="tabpanel" aria-labelledby="tab-login" noValidate hidden={hidden} onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="login-email">Email</label>
        <input id="login-email" name="email" type="email" autoComplete="email" required
          value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="login-password">Password</label>
        <input id="login-password" name="password" type="password" autoComplete="current-password" required
          value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error && <p className="notice" id="login-error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary btn-block" id="login-submit" disabled={busy} aria-busy={busy}>
        {busy ? "Signing in..." : "Log in"}
      </button>
    </form>
  );
}

function SignupForm({ hidden, request, onAuthenticated }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    const cleanName = name.trim();
    const cleanEmail = email.trim();
    if (cleanName.length < 2) return setError("Enter your name (at least 2 characters).");
    if (!isValidEmail(cleanEmail)) return setError("Enter a valid email address.");
    if (password.length < 8) return setError("Use a password with at least 8 characters.");

    setBusy(true);
    try {
      const data = await request("/api/auth/signup", {
        method: "POST",
        body: { name: cleanName, email: cleanEmail, password },
        auth: false,
      });
      onAuthenticated(data);
    } catch (err) {
      setError(friendlyError(err, "signup"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id="signup-form" role="tabpanel" aria-labelledby="tab-signup" noValidate hidden={hidden} onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="signup-name">Name</label>
        <input id="signup-name" name="name" type="text" autoComplete="name" maxLength={60} required
          value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="signup-email">Email</label>
        <input id="signup-email" name="email" type="email" autoComplete="email" required
          value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="signup-password">Password</label>
        <input id="signup-password" name="password" type="password" autoComplete="new-password"
          aria-describedby="signup-password-hint" required
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <span className="hint" id="signup-password-hint">At least 8 characters.</span>
      </div>
      {error && <p className="notice" id="signup-error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary btn-block" id="signup-submit" disabled={busy} aria-busy={busy}>
        {busy ? "Creating account..." : "Create account"}
      </button>
    </form>
  );
}

// Log in / Sign up card. Shown only while logged out.
// focusTick goes up whenever another part of the page asks to bring this card into view.
export default function AuthPanel({ mode, onModeChange, request, onAuthenticated, focusTick }) {
  const panelRef = useRef(null);
  const seenTick = useRef(focusTick);

  useEffect(() => {
    if (focusTick === seenTick.current) return;
    seenTick.current = focusTick;
    if (panelRef.current) {
      panelRef.current.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    }
    const field = document.getElementById(mode === "login" ? "login-email" : "signup-name");
    if (field) field.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTick]);

  function handleTabKey(event) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = mode === "login" ? "signup" : "login";
    onModeChange(next);
    const tab = document.getElementById(next === "login" ? "tab-login" : "tab-signup");
    if (tab) tab.focus();
  }

  const isLogin = mode === "login";

  return (
    <section className="panel" id="auth-panel" aria-labelledby="auth-heading" ref={panelRef}>
      <h2 id="auth-heading">Join to vote</h2>
      <p className="panel-intro">Log in or create an account to vote and make your own polls.</p>

      <div className="tabs" role="tablist" aria-label="Account">
        <button type="button" className="tab" role="tab" id="tab-login" aria-controls="login-form"
          aria-selected={isLogin} tabIndex={isLogin ? 0 : -1}
          onClick={() => onModeChange("login")} onKeyDown={handleTabKey}>
          Log in
        </button>
        <button type="button" className="tab" role="tab" id="tab-signup" aria-controls="signup-form"
          aria-selected={!isLogin} tabIndex={isLogin ? -1 : 0}
          onClick={() => onModeChange("signup")} onKeyDown={handleTabKey}>
          Sign up
        </button>
      </div>

      <LoginForm hidden={!isLogin} request={request} onAuthenticated={onAuthenticated} />
      <SignupForm hidden={isLogin} request={request} onAuthenticated={onAuthenticated} />
    </section>
  );
}
