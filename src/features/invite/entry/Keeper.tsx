"use client";

// The secret keeper's page: /k#<code>. Write-only by design (security rule 29):
// it can seal or correct the answer, and it can say that something is sealed,
// but nothing the server returns — and nothing kept on this page after sealing —
// says what the answer is.

import { useEffect, useRef, useState } from "react";
import { apiPost } from "../lib/api";
import { getMessages } from "../messages";
import { Icon } from "../Icon";
import { Gate } from "./Gate";
import { useBrowserLocale } from "./useBrowserLocale";

type ServerState = "ready" | "sealed" | "locked" | "other_device" | "not_found";
type View = "loading" | "choose" | "confirm" | "sealing" | "error" | ServerState;
type Choice = "boy" | "girl" | null;

const CODE = /^[A-Za-z0-9_-]{16,32}$/;
const STORE = "lamma:keeper";
const MAX_BABIES = 3;

function recallCode(): string | null {
  const fragment = window.location.hash.slice(1);
  if (fragment) window.history.replaceState(null, "", window.location.pathname);
  try {
    // Kept for this tab only, so a reload still works after the fragment is gone.
    if (CODE.test(fragment)) window.sessionStorage.setItem(STORE, fragment);
    const stored = window.sessionStorage.getItem(STORE);
    return stored && CODE.test(stored) ? stored : null;
  } catch {
    return CODE.test(fragment) ? fragment : null;
  }
}

export function Keeper() {
  const locale = useBrowserLocale();
  const t = getMessages(locale).keeper;
  const common = getMessages(locale).common;
  const [view, setView] = useState<View>("loading");
  const [babies, setBabies] = useState<Choice[]>([null]);
  const code = useRef<string | null>(null);
  const started = useRef(false);
  const confirmRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const send = async (answer?: ("boy" | "girl")[]): Promise<ServerState | "error"> => {
    const result = await apiPost<{ state: ServerState }>("/api/keeper", answer ? { code: code.current, answer } : { code: code.current });
    if (result.ok) return result.data.state;
    if (result.status === 404) return "not_found";
    return "error";
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    code.current = recallCode();
    if (!code.current) return void setTimeout(() => setView("not_found"), 0);
    void send().then((state) => setView(state === "ready" ? "choose" : state));
  }, []);

  useEffect(() => {
    if (view === "confirm") confirmRef.current?.focus();
    if (view === "sealed" || view === "locked") titleRef.current?.focus();
  }, [view]);

  const complete = babies.every((choice) => choice !== null);
  const summary = babies.map((choice) => (choice ? t[choice] : "")).join(t.and);

  const seal = async () => {
    if (!complete) return;
    setView("sealing");
    const state = await send(babies as ("boy" | "girl")[]);
    // Forget the choice at once: after this the page only knows "sealed".
    if (state !== "error") setBabies([null]);
    setView(state === "ready" ? "choose" : state);
  };

  const setChoice = (index: number, choice: Choice) => setBabies((current) => current.map((value, i) => (i === index ? choice : value)));

  return (
    <Gate locale={locale} busy={view === "loading" || view === "sealing"}>
      {view === "loading" ? (
        <p className="inv-gate__body" role="status">
          {common.loading}
        </p>
      ) : view === "choose" || view === "confirm" || view === "sealing" ? (
        <>
          <h1 className="inv-gate__title">{t.title}</h1>
          <p className="inv-gate__body">
            {t.intro} {t.intro2}
          </p>
          <form
            className="inv-keeper"
            onSubmit={(event) => {
              event.preventDefault();
              if (complete) setView("confirm");
            }}
          >
            {babies.map((choice, index) => (
              <fieldset key={index} className="inv-keeper__baby" disabled={view !== "choose"} data-testid={`baby-${index + 1}`}>
                <legend className="inv-keeper__legend">
                  <span>{babies.length > 1 ? t.baby(index + 1) : t.choose}</span>
                  {babies.length > 1 ? (
                    <button type="button" className="inv-link" onClick={() => setBabies((current) => current.filter((_, i) => i !== index))}>
                      {t.removeBaby}
                    </button>
                  ) : null}
                </legend>
                <div className="inv-keeper__pair">
                  {(["boy", "girl"] as const).map((value) => (
                    <label key={value} className="inv-choice">
                      <input type="radio" name={`baby-${index}`} value={value} checked={choice === value} onChange={() => setChoice(index, value)} />
                      <span>{t[value]}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            {babies.length < MAX_BABIES && view === "choose" ? (
              <button type="button" className="inv-link" onClick={() => setBabies((current) => [...current, null])}>
                <Icon name="plus" size={16} />
                &nbsp;{t.addBaby}
              </button>
            ) : null}

            {view === "choose" ? (
              <button type="submit" className="inv-btn inv-btn--solid" disabled={!complete} aria-describedby={complete ? undefined : "keeper-pick"}>
                <Icon name="lock" /> {t.seal}
              </button>
            ) : (
              <div className="inv-keeper__confirm" role="alertdialog" aria-labelledby="keeper-confirm-title" aria-describedby="keeper-confirm-body" tabIndex={-1} ref={confirmRef} data-testid="keeper-confirm">
                <h2 id="keeper-confirm-title" className="inv-h3">
                  {t.confirmTitle(summary)}
                </h2>
                <p id="keeper-confirm-body" className="inv-text">
                  {t.confirmBody}
                </p>
                <div className="inv-actions">
                  <button type="button" className="inv-btn inv-btn--solid" onClick={seal} disabled={view === "sealing"}>
                    {view === "sealing" ? t.sealing : t.confirmYes}
                  </button>
                  <button type="button" className="inv-btn" onClick={() => setView("choose")} disabled={view === "sealing"}>
                    {t.confirmNo}
                  </button>
                </div>
              </div>
            )}
            {complete ? null : (
              <p id="keeper-pick" className="inv-hint">
                {t.pickFirst}
              </p>
            )}
          </form>
        </>
      ) : view === "sealed" ? (
        <div role="status" className="inv-gate__card" data-testid="keeper-sealed">
          <h1 className="inv-gate__title" tabIndex={-1} ref={titleRef}>
            {t.sealedTitle}
          </h1>
          <p className="inv-gate__body">{t.sealedBody}</p>
          <div className="inv-actions">
            <button type="button" className="inv-btn" onClick={() => setView("choose")}>
              {t.correct}
            </button>
          </div>
        </div>
      ) : view === "error" ? (
        <div role="alert" className="inv-gate__card">
          <p className="inv-gate__body">{common.error}</p>
          <div className="inv-actions">
            <button type="button" className="inv-btn inv-btn--solid" onClick={() => window.location.reload()}>
              {common.retry}
            </button>
          </div>
        </div>
      ) : (
        <div role="status" className="inv-gate__card" data-testid={`keeper-${view}`}>
          <h1 className="inv-gate__title" tabIndex={-1} ref={titleRef}>
            {view === "locked" ? t.lockedTitle : view === "other_device" ? t.otherTitle : t.invalidTitle}
          </h1>
          <p className="inv-gate__body">{view === "locked" ? t.lockedBody : view === "other_device" ? t.otherBody : t.invalidBody}</p>
        </div>
      )}
    </Gate>
  );
}
