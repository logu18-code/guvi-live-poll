const STATUS_TEXT = {
  checking: "Checking server",
  online: "Server online",
  degraded: "Server degraded",
  offline: "Server offline",
};

export default function Header({ backend, user, onLogout }) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <div className="brand">
          <h1 className="brand-name">Live Poll</h1>
          <p className="brand-tagline">Create. Vote. See the results.</p>
        </div>

        <div className="header-right">
          {/* Reflects whether the backend is reachable, not vote activity. */}
          <p className="backend-status" id="backend-status" data-state={backend}>
            <span className="pulse" aria-hidden="true" />
            <span id="backend-status-text">{STATUS_TEXT[backend]}</span>
          </p>

          {user && (
            <div className="user-info" id="user-info">
              <span className="user-name" id="user-name">{user.name || "Your account"}</span>
              <span className="user-email" id="user-email">{user.email || ""}</span>
              <button type="button" className="btn btn-secondary btn-small" id="logout-btn" onClick={onLogout}>
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
