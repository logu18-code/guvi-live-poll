import { useEffect, useRef, useState } from "react";
import { friendlyError } from "../api.js";

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 10;

const inputId = (key) => "option-input-" + key;

// "Create a poll" card. Shown only while logged in.
export default function CreatePanel({ request, onCreated }) {
  const nextKey = useRef(2);
  const pendingFocus = useRef(null);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState([{ key: 0, value: "" }, { key: 1, value: "" }]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Move keyboard focus after an option is added or removed, once the new row exists.
  useEffect(() => {
    if (!pendingFocus.current) return;
    const field = document.getElementById(pendingFocus.current);
    pendingFocus.current = null;
    if (field) field.focus();
  });

  function updateOption(key, value) {
    setOptions((list) => list.map((option) => (option.key === key ? { ...option, value } : option)));
  }

  function addOption() {
    if (options.length >= MAX_OPTIONS) return;
    const key = nextKey.current++;
    setOptions([...options, { key, value: "" }]);
    pendingFocus.current = inputId(key);
  }

  function removeOption(index) {
    if (options.length <= MIN_OPTIONS) return;
    const next = options.filter((_, i) => i !== index);
    setOptions(next);
    pendingFocus.current = inputId(next[Math.min(index, next.length - 1)].key);
  }

  function resetForm() {
    setQuestion("");
    setOptions([{ key: nextKey.current++, value: "" }, { key: nextKey.current++, value: "" }]);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const cleanQuestion = question.trim();
    const texts = options.map((option) => option.value.trim());

    if (!cleanQuestion) return setError("Enter a question for your poll.");
    const emptyIndex = texts.findIndex((text) => !text);
    if (emptyIndex !== -1) {
      return setError("Option " + (emptyIndex + 1) + " is empty. Fill it in or remove it.");
    }
    if (new Set(texts.map((text) => text.toLowerCase())).size !== texts.length) {
      return setError("Each option must be different.");
    }

    setBusy(true);
    try {
      await request("/api/polls", { method: "POST", body: { question: cleanQuestion, options: texts } });
      resetForm();
      onCreated();
    } catch (err) {
      setError(friendlyError(err, "create"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" id="create-panel" aria-labelledby="create-heading">
      <h2 id="create-heading">Create a poll</h2>

      <form id="create-form" noValidate onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="poll-question">Question</label>
          <input id="poll-question" name="question" type="text" maxLength={200} autoComplete="off"
            placeholder="What is your favorite language?" required
            value={question} onChange={(e) => setQuestion(e.target.value)} />
        </div>

        <fieldset className="options-field">
          <legend>Options</legend>
          <div id="option-inputs">
            {options.map((option, index) => (
              <div className="option-row" key={option.key}>
                <label className="sr-only" htmlFor={inputId(option.key)}>{"Option " + (index + 1)}</label>
                <input id={inputId(option.key)} type="text" maxLength={100} autoComplete="off"
                  placeholder={"Option " + (index + 1)}
                  value={option.value} onChange={(e) => updateOption(option.key, e.target.value)} />
                <button type="button" className="btn btn-secondary btn-icon"
                  aria-label={"Remove option " + (index + 1)}
                  disabled={options.length <= MIN_OPTIONS} onClick={() => removeOption(index)}>
                  {"\u00d7"}
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-secondary btn-small" id="add-option-btn"
            disabled={options.length >= MAX_OPTIONS} onClick={addOption}>
            Add option
          </button>
        </fieldset>

        {error && <p className="notice" id="create-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary btn-block" id="create-submit" disabled={busy} aria-busy={busy}>
          {busy ? "Creating poll..." : "Create poll"}
        </button>
      </form>
    </section>
  );
}
