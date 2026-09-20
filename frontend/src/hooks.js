import { useCallback, useEffect, useRef, useState } from "react";

import {
ApiError,
apiRequest,
friendlyError,
normalizePolls,
API_BASE,
} from "./api.js";

export function useApi(token, onStatus, onExpired) {
const latest = useRef({
token,
onStatus,
onExpired,
});

useEffect(() => {
latest.current = {
token,
onStatus,
onExpired,
};
});

return useCallback(async (path, options = {}) => {
const { auth = true, ...rest } = options;

const current = latest.current;
const sentToken = auth ? current.token : null;

try {
  const data = await apiRequest(path, {
    ...rest,
    token: sentToken,
  });

  current.onStatus("online");

  return data;
} catch (err) {
  if (err instanceof ApiError) {
    current.onStatus(
      err.isNetwork ? "offline" : "online"
    );

    if (err.status === 401 && sentToken) {
      current.onExpired();
    }
  }

  throw err;
}

}, []);
}

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

if (!loadedRef.current) {
  setError("");
}

try {
  const data = await request(
    "/api/polls/active",
    { auth: false }
  );

  if (mine !== seq.current) {
    return;
  }

  loadedRef.current = true;
  lastRef.current = Date.now();

  setPolls(normalizePolls(data));
  setHasLoaded(true);
  setError("");
  setLastLoadedAt(lastRef.current);
} catch (err) {
  if (mine !== seq.current) {
    return;
  }

  setError(
    friendlyError(err, "polls")
  );
} finally {
  if (mine === seq.current) {
    setLoading(false);
  }
}

}, [request]);

const applyUpdate = useCallback(
(updatedPoll) => {
if (
!updatedPoll ||
typeof updatedPoll.id !== "string"
) {
return;
}

  const normalized = normalizePolls({
    polls: [updatedPoll],
  })[0];

  if (!normalized) {
    return;
  }

  setPolls((currentPolls) => {
    const exists = currentPolls.some(
      (poll) =>
        poll &&
        poll.id === normalized.id
    );

    if (!exists) {
      return currentPolls;
    }

    return currentPolls.map((poll) =>
      poll &&
      poll.id === normalized.id
        ? normalized
        : poll
    );
  });

  setLastLoadedAt(Date.now());
},
[]

);

useEffect(() => {
reload();
}, [reload]);

useEffect(() => {
function onVisible() {
const stale =
Date.now() - lastRef.current > 3000;

  if (
    document.visibilityState === "visible" &&
    loadedRef.current &&
    stale
  ) {
    reload();
  }
}

document.addEventListener(
  "visibilitychange",
  onVisible
);

return () => {
  document.removeEventListener(
    "visibilitychange",
    onVisible
  );
};

}, [reload]);

return {
polls,
hasLoaded,
loading,
error,
lastLoadedAt,
reload,
applyUpdate,
};
}

export function usePollEvents(pollIds, onPollUpdate) {
  const latest = useRef(onPollUpdate);

  useEffect(() => {
    latest.current = onPollUpdate;
  }, [onPollUpdate]);

  const idsKey = Array.isArray(pollIds)
    ? [...new Set(pollIds.filter(Boolean))].join("|")
    : "";

  useEffect(() => {
    const ids = idsKey
      ? idsKey.split("|").filter(Boolean)
      : [];

    if (ids.length === 0) {
      return undefined;
    }

    const connections = new Map();

    ids.forEach((id) => {
      const url =
        `${API_BASE}/api/polls/` +
        `${encodeURIComponent(id)}/events`;

      const source = new EventSource(url);

      console.log("SSE CONNECTING:", url);

      source.onopen = () => {
        console.log("SSE CONNECTED:", id);
      };

      const handleUpdate = (event) => {
        try {
          const poll = JSON.parse(event.data);

          console.log("SSE EVENT RECEIVED:", poll);

          if (typeof latest.current === "function") {
            latest.current(poll);
          }
        } catch (error) {
          console.error(
            "Failed to parse realtime poll update",
            error
          );
        }
      };

      source.addEventListener("poll-update", handleUpdate);

      console.log("SSE LISTENER ATTACHED:", id);

      source.onerror = () => {
        console.warn(
          `Realtime connection issue for poll ${id}.`
        );
      };

      connections.set(id, source);
    });

    return () => {
      connections.forEach((source) => source.close());
      connections.clear();
    };
  }, [idsKey]);
}
export function useBump(value) {
const previous = useRef(value);

const [bumped, setBumped] =
useState(false);

useEffect(() => {
if (value > previous.current) {
previous.current = value;

  setBumped(true);

  const timer = setTimeout(() => {
    setBumped(false);
  }, 1500);

  return () => clearTimeout(timer);
}

previous.current = value;
setBumped(false);

}, [value]);

return bumped;
}

