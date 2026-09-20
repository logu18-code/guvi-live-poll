import { useEffect, useState } from "react";
import { useBump } from "../hooks.js";
import { formatDate, plural } from "../utils.js";

// One box for the loading, empty and error states. The stylesheet picks the icon
// from role="alert" (error) and from whether a hint line exists (empty vs loading).
function StateBox({ title, hint, actionLabel, onAction }) {
  return (
    <div className="state" role={actionLabel ? "alert" : "status"}>
      <p className="state-title">{title}</p>
      {hint && <p className="state-hint">{hint}</p>}
      {actionLabel && (
        <button type="button" className="btn btn-secondary" onClick={onAction}>{actionLabel}</button>
      )}
    </div>
  );
}

// The result bar behind an option. It mounts at 0% and grows to its share,
// and later changes animate from the old width to the new one.
function OptionBar({ pct }) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setWidth(pct));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [pct]);

  return <span className="option-bar" aria-hidden="true" style={{ width: width + "%" }} />;
}

// Child order matters: the stylesheet relies on input -> bar -> mark -> text -> figures.
function OptionRow({ pollId, safeId, option, pct, isSelected, isMine, locked, onSelect }) {
  const bumped = useBump(option.votes);
  const className = "option" + (isSelected ? " is-selected" : "") + (isMine ? " is-voted" : "") + (locked ? " is-locked" : "");

  return (
    <label className={className}>
      <input type="radio" name={"poll-" + safeId} value={option.id}
        checked={isSelected} disabled={locked} onChange={() => onSelect(pollId, option.id)} />
      <OptionBar pct={pct} />
      <span className="option-mark" aria-hidden="true" />
      <span className="option-text">
        {option.text}
        {isMine && <span className="option-tag">Your vote</span>}
      </span>
      <span className="option-figures">
        <span className={"option-count" + (bumped ? " is-bumped" : "")}>
          <strong key={option.votes}>{option.votes}</strong>
          {" " + plural(option.votes, "vote")}
        </span>
        <span className="option-pct">{pct}%</span>
      </span>
    </label>
  );
}

function PollCard({ poll, loggedIn, votedMap, selectedId, submitting, status, onSelect, onVote, onLogin }) {
  const pid = poll.id;
  const safeId = pid.replace(/[^\w-]/g, "");
  const totalVotes = poll.options.reduce((sum, option) => sum + option.votes, 0);

  const hasVoted = Object.prototype.hasOwnProperty.call(votedMap, pid);
  const votedOptionId = hasVoted ? votedMap[pid] || null : null;
  const locked = hasVoted || submitting;
  const currentId = hasVoted ? votedOptionId : selectedId || null;

  // One line under the vote button: the latest outcome, or a plain hint.
  let line = status;
  let showLoginLink = false;
  if (!line && hasVoted) line = { type: "info", text: "You have voted in this poll." };
  if (!line && !loggedIn) {
    line = { type: "info", text: "Log in or sign up to vote. " };
    showLoginLink = true;
  }

  const created = formatDate(poll.createdAt);

  return (
    <article className="poll" aria-labelledby={"question-" + safeId}>
      <h3 className="poll-question" id={"question-" + safeId}>{poll.question}</h3>
      {created && <p className="poll-meta">{"Created " + created}</p>}

      <form noValidate onSubmit={(event) => { event.preventDefault(); onVote(pid); }}>
        <fieldset className="options">
          <legend className="sr-only">{"Options for: " + poll.question}</legend>
          {poll.options.map((option) => (
            <OptionRow
              key={option.id}
              pollId={pid}
              safeId={safeId}
              option={option}
              pct={totalVotes ? Math.round((option.votes / totalVotes) * 100) : 0}
              isSelected={currentId === option.id}
              isMine={hasVoted && votedOptionId === option.id}
              locked={locked}
              onSelect={onSelect}
            />
          ))}
        </fieldset>

        <div className="poll-footer">
          <p className="poll-total">Total votes: <strong>{totalVotes}</strong></p>
          <button type="submit" className="btn btn-primary" disabled={locked}
            aria-busy={submitting ? "true" : undefined}>
            {hasVoted ? "Voted" : submitting ? "Submitting vote..." : "Vote"}
          </button>
        </div>

        {line && (
          <p className={"poll-status is-" + line.type}>
            {line.text}
            {showLoginLink && (
              <button type="button" className="link-button" onClick={onLogin}>Log in</button>
            )}
          </p>
        )}
      </form>
    </article>
  );
}

export default function PollList({
  polls, hasLoaded, loading, error, lastLoadedAt, onRefresh,
  loggedIn, votedMap, selected, voting, pollStatus, onSelect, onVote, onLogin,
}) {
  let content;
  if (!hasLoaded) {
    content = error
      ? <StateBox title="Couldn't load polls" hint={error} actionLabel="Try again" onAction={() => onRefresh()} />
      : <StateBox title="Loading polls..." />;
  } else if (polls.length === 0) {
    content = (
      <StateBox
        title="No active polls yet."
        hint={loggedIn ? "Use the form to create the first one." : "Log in or sign up to create the first one."}
      />
    );
  } else {
    content = polls.map((poll) => (
      <PollCard
        key={poll.id}
        poll={poll}
        loggedIn={loggedIn}
        votedMap={votedMap}
        selectedId={selected[poll.id]}
        submitting={Boolean(voting[poll.id])}
        status={pollStatus[poll.id]}
        onSelect={onSelect}
        onVote={onVote}
        onLogin={onLogin}
      />
    ));
  }

  const updated = lastLoadedAt
    ? "Updated " + new Date(lastLoadedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "";

  return (
    <section className="polls-column" aria-labelledby="polls-heading">
      <div className="section-head">
        <h2 id="polls-heading" tabIndex={-1}>Active polls</h2>
        <div className="section-tools">
          <span className="updated" id="updated-at">{updated}</span>
          <button type="button" className="btn btn-secondary btn-small" id="refresh-btn"
            disabled={loading} onClick={() => onRefresh()}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && hasLoaded && <p className="notice" id="polls-notice" role="alert">{error}</p>}
      <div className="polls-list" id="polls-list" aria-busy={loading && !hasLoaded ? "true" : "false"}>
        {content}
      </div>
    </section>
  );
}
