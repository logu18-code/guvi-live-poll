jsx
import { useCallback, useEffect, useRef, useState } from "react";

import AuthPanel from "./components/AuthPanel.jsx";
import CreatePanel from "./components/CreatePanel.jsx";
import Header from "./components/Header.jsx";
import PollList from "./components/PollList.jsx";
import Toast from "./components/Toast.jsx";

import { ApiError, checkHealth, friendlyError } from "./api.js";

import {
  useApi,
  usePollEvents,
  usePolls,
} from "./hooks.js";

import {
  clearSession,
  loadSession,
  readVotedMap,
  rememberVote,
  saveSession,
  votesKey,
} from "./session.js";

export default function App() {
  const [session, setSession] = useState(loadSession);

  const [backend, setBackend] = useState("checking");

  const [authMode, setAuthMode] = useState("login");

  const [authFocusTick, setAuthFocusTick] = useState(0);

  const [toast, setToast] = useState(null);

  const [announcement, setAnnouncement] = useState("");

  const [votedMap, setVotedMap] = useState(() =>
    readVotedMap(session && session.user)
  );

  const [selected, setSelected] = useState({});

  const [voting, setVoting] = useState({});

  const [pollStatus, setPollStatus] = useState({});

  const votingRef = useRef({});

  const toastTimer = useRef(null);

  const announceTimer = useRef(null);

  const loggedOutByUser = useRef(false);

  const user = session ? session.user : null;

  const voteKey = votesKey(user);

  /* ---------- Messages ---------- */

  const announce = useCallback((text) => {
    setAnnouncement("");

    clearTimeout(announceTimer.current);

    announceTimer.current = setTimeout(() => {
      setAnnouncement(text);
    }, 50);
  }, []);

  const showToast = useCallback(
    (text, type = "success") => {
      setToast({
        text,
        type,
        id: Date.now(),
      });

      announce(text);

      clearTimeout(toastTimer.current);

      toastTimer.current = setTimeout(() => {
        setToast(null);
      }, 4500);
    },
    [announce]
  );

  /* ---------- API and polls ---------- */

  const expireSession = useCallback(() => {
    clearSession();

    setSession(null);

    setSelected({});

    setPollStatus({});

    setVoting({});

    votingRef.current = {};

    setAuthMode("login");

    showToast(
      "Your session has expired. Please log in again.",
      "error"
    );
  }, [showToast]);

  const request = useApi(
    session ? session.token : null,
    setBackend,
    expireSession
  );

  const {
    polls,
    hasLoaded,
    loading,
    error,
    lastLoadedAt,
    reload,
    applyUpdate,
  } = usePolls(request);

  /*
   * REALTIME POLL UPDATES
   *
   * Redis
   *   ↓
   * Go backend
   *   ↓
   * Server-Sent Events
   *   ↓
   * usePollEvents()
   *   ↓
   * applyUpdate()
   *   ↓
   * React UI
   *
   * No page refresh is required.
   */
  usePollEvents(
    polls.map((poll) => poll.id),
    applyUpdate
  );

  useEffect(() => {
    let alive = true;

    checkHealth().then((status) => {
      if (alive) {
        setBackend(status);
      }
    });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    document.body.dataset.auth = session ? "in" : "out";
  }, [session]);

  /*
   * Switching users changes the local "already voted"
   * information shown for that account.
   */
  useEffect(() => {
    setVotedMap(readVotedMap(user));

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voteKey]);

  /* ---------- Authentication ---------- */

  const completeAuth = useCallback(
    (data) => {
      if (
        !data ||
        typeof data.token !== "string" ||
        !data.token ||
        !data.user
      ) {
        throw new ApiError(500, "");
      }

      saveSession(data.token, data.user);

      setSession({
        token: data.token,
        user: data.user,
      });

      reload();

      const heading =
        document.getElementById("polls-heading");

      if (heading) {
        heading.focus({
          preventScroll: true,
        });
      }
    },
    [reload]
  );

  const logout = useCallback(() => {
    clearSession();

    loggedOutByUser.current = true;

    setSession(null);

    setSelected({});

    setPollStatus({});

    setVoting({});

    votingRef.current = {};

    setAuthMode("login");

    showToast("You have been logged out.");
  }, [showToast]);

  /*
   * After manual logout, move keyboard focus
   * back to the login tab.
   */
  useEffect(() => {
    if (!session && loggedOutByUser.current) {
      loggedOutByUser.current = false;

      const tab = document.getElementById("tab-login");

      if (tab) {
        tab.focus({
          preventScroll: true,
        });
      }
    }
  }, [session]);

  /*
   * Used when an unauthenticated user tries to vote.
   */
  const openAuthPanel = useCallback(
    (mode = "login") => {
      if (session) {
        return;
      }

      setAuthMode(mode);

      setAuthFocusTick((tick) => tick + 1);
    },
    [session]
  );

  /* ---------- Voting ---------- */

  const setStatus = useCallback(
    (pollId, type, text) => {
      setPollStatus((all) => ({
        ...all,
        [pollId]: {
          type,
          text,
        },
      }));

      announce(text);
    },
    [announce]
  );

  const selectOption = useCallback(
    (pollId, optionId) => {
      setSelected((all) => ({
        ...all,
        [pollId]: optionId,
      }));

      setPollStatus((all) => {
        if (!(pollId in all)) {
          return all;
        }

        const next = {
          ...all,
        };

        delete next[pollId];

        return next;
      });
    },
    []
  );

  const vote = useCallback(
    async (pollId) => {
      if (votingRef.current[pollId]) {
        return;
      }

      if (!polls.some((poll) => poll.id === pollId)) {
        return;
      }

      if (!session) {
        setStatus(
          pollId,
          "error",
          "Log in or sign up to vote."
        );

        openAuthPanel("login");

        return;
      }

      const optionId = selected[pollId];

      if (!optionId) {
        setStatus(
          pollId,
          "error",
          "Select an option before voting."
        );

        return;
      }

      const voter = session.user;

      votingRef.current[pollId] = true;

      setVoting((all) => ({
        ...all,
        [pollId]: true,
      }));

      setStatus(
        pollId,
        "info",
        "Submitting vote..."
      );

      try {
        await request(
          "/api/polls/" +
            encodeURIComponent(pollId) +
            "/vote",
          {
            method: "POST",
            body: {
              option_id: optionId,
            },
          }
        );

        setVotedMap(
          rememberVote(
            voter,
            pollId,
            optionId
          )
        );

        setSelected((all) => {
          const next = {
            ...all,
          };

          delete next[pollId];

          return next;
        });

        setStatus(
          pollId,
          "success",
          "Vote recorded. Thank you!"
        );
      } catch (err) {
        if (err.status === 409) {
          setVotedMap(
            rememberVote(
              voter,
              pollId,
              null
            )
          );
        }

        setStatus(
          pollId,
          "error",
          friendlyError(err, "vote")
        );
      } finally {
        delete votingRef.current[pollId];

        setVoting((all) => {
          const next = {
            ...all,
          };

          delete next[pollId];

          return next;
        });
      }

      /*
       * Keep the fallback refresh after voting.
       * The other users receive their update through
       * Redis + SSE without refreshing.
       */
      await reload();
    },
    [
      polls,
      session,
      selected,
      request,
      reload,
      setStatus,
      openAuthPanel,
    ]
  );

  const handleCreated = useCallback(() => {
    showToast("Poll created successfully.");

    reload();
  }, [showToast, reload]);

  return (
    <>
      <a
        className="skip-link"
        href="#polls-heading"
      >
        Skip to polls
      </a>

      <Header
        backend={backend}
        user={user}
        onLogout={logout}
      />

      <main className="layout">
        <PollList
          polls={polls}
          hasLoaded={hasLoaded}
          loading={loading}
          error={error}
          lastLoadedAt={lastLoadedAt}
          onRefresh={reload}
          loggedIn={Boolean(session)}
          votedMap={votedMap}
          selected={selected}
          voting={voting}
          pollStatus={pollStatus}
          onSelect={selectOption}
          onVote={vote}
          onLogin={() => openAuthPanel("login")}
        />

        <aside className="side-column">
          {session ? (
            <CreatePanel
              request={request}
              onCreated={handleCreated}
            />
          ) : (
            <AuthPanel
              mode={authMode}
              onModeChange={setAuthMode}
              request={request}
              onAuthenticated={completeAuth}
              focusTick={authFocusTick}
            />
          )}
        </aside>
      </main>

      <Toast toast={toast} />

      <div
        className="sr-only"
        id="announcer"
        role="status"
        aria-live="polite"
      >
        {announcement}
      </div>
    </>
  );
}

