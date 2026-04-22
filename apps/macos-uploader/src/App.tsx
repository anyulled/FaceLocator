import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

type AuthStatus = {
  authenticated: boolean;
  tokenPreview: string | null;
};

type EventSummary = {
  id: string;
  slug: string;
  title: string;
  venue: string;
  description: string;
  startsAt: string;
  endsAt: string;
  photoCount: number;
};

type SessionStatus = "IDLE" | "READY" | "RUNNING" | "CANCELLING" | "CANCELLED" | "COMPLETED";
type ItemStatus =
  | "DISCOVERED"
  | "SKIPPED_UNSUPPORTED"
  | "SKIPPED_SUBDIRECTORY"
  | "PREPROCESSING"
  | "PRESIGNING"
  | "UPLOADING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

type UploadItemState = {
  itemId: string;
  fileName: string;
  sourcePath: string;
  status: ItemStatus;
  error: string | null;
  uploadedObjectKey: string | null;
};

type UploadSessionState = {
  sessionId: string;
  folderPath: string | null;
  status: SessionStatus;
  items: UploadItemState[];
};

const importMetaEnv = (import.meta as ImportMeta & {
  env?: {
    VITE_FACE_LOCATOR_BASE_URL?: string;
  };
}).env;

const DEFAULT_BACKEND_BASE_URL = "https://main.d1lne42ooc3wfs.amplifyapp.com";
const BACKEND_BASE_URL = importMetaEnv?.VITE_FACE_LOCATOR_BASE_URL || DEFAULT_BACKEND_BASE_URL;

function statusLabel(status: ItemStatus) {
  return status.replaceAll("_", " ");
}

function countByStatus(items: UploadItemState[], statuses: ItemStatus[]) {
  return items.filter((item) => statuses.includes(item.status)).length;
}

function reportForSession(session: UploadSessionState, selectedEvent: EventSummary | null) {
  const failed = session.items.filter((item) => item.status === "FAILED");
  const skipped = session.items.filter((item) =>
    item.status === "SKIPPED_SUBDIRECTORY" || item.status === "SKIPPED_UNSUPPORTED"
  );

  return [
    `Event: ${selectedEvent?.title ?? "Unknown"} (${selectedEvent?.slug ?? "n/a"})`,
    `Folder: ${session.folderPath ?? "n/a"}`,
    `Uploaded: ${countByStatus(session.items, ["SUCCEEDED"])}`,
    `Failed: ${failed.length}`,
    `Skipped: ${skipped.length}`,
    "",
    "Failed files:",
    ...failed.map((item) => `- ${item.fileName}: ${item.error ?? "Unknown error"}`),
  ].join("\n");
}

export function App() {
  const [auth, setAuth] = useState<AuthStatus>({ authenticated: false, tokenPreview: null });
  const [tokenDraft, setTokenDraft] = useState("");
  const [showTokenSheet, setShowTokenSheet] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [selectedEventSlug, setSelectedEventSlug] = useState("");
  const [session, setSession] = useState<UploadSessionState | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const selectedEvent = useMemo(
    () => events.find((event) => event.slug === selectedEventSlug) ?? null,
    [events, selectedEventSlug],
  );

  useEffect(() => {
    invoke<AuthStatus>("auth_status")
      .then((status) => {
        setAuth(status);
        if (status.authenticated) {
          return refreshEvents();
        }
        return undefined;
      })
      .catch((error) => setBanner(String(error)));
  }, []);

  useEffect(() => {
    const unlistenSession = listen<{ sessionId: string }>("uploader://session", async (event) => {
      setSession((current) => {
        if (!current || current.sessionId !== event.payload.sessionId) {
          return current;
        }
        void invoke<UploadSessionState>("uploader_get_state", {
          sessionId: event.payload.sessionId,
        }).then(setSession);
        return current;
      });
    });

    const unlistenItems = listen<{ sessionId: string; item: UploadItemState }>("uploader://item", async (event) => {
      setSession((current) => {
        if (!current || event.payload.sessionId !== current.sessionId) {
          return current;
        }

        return {
          ...current,
          items: current.items.map((item) =>
            item.itemId === event.payload.item.itemId ? event.payload.item : item
          ),
        };
      });
    });

    return () => {
      void unlistenSession.then((fn) => fn());
      void unlistenItems.then((fn) => fn());
    };
  }, []);

  async function refreshEvents() {
    const response = await invoke<{ events: EventSummary[] }>("admin_list_events", {
      request: {
        backendBaseUrl: BACKEND_BASE_URL,
        page: 1,
        pageSize: 100,
      },
    });
    setEvents(response.events);
    setSelectedEventSlug((current) => current || response.events[0]?.slug || "");
  }

  async function handleTokenSubmit() {
    try {
      const status = await invoke<AuthStatus>("auth_set_bearer_token", { token: tokenDraft.trim() });
      setAuth(status);
      setAuthError(null);
      setShowTokenSheet(false);
      await refreshEvents();
    } catch (error) {
      setAuthError(String(error));
    }
  }

  async function handleBrowserSignIn() {
    try {
      setSigningIn(true);
      setAuthError(null);
      const status = await invoke<AuthStatus>("auth_begin_browser_sign_in", {
        backendBaseUrl: BACKEND_BASE_URL,
      });
      setAuth(status);
      setShowTokenSheet(false);
      await refreshEvents();
    } catch (error) {
      setAuthError(String(error));
      setBanner(String(error));
    } finally {
      setSigningIn(false);
    }
  }

  async function handleFolderSelection(path?: string | null) {
    const folderPath = path || (await open({ directory: true, multiple: false }));
    if (!folderPath || Array.isArray(folderPath)) {
      return;
    }

    try {
      const nextSession = await invoke<UploadSessionState>("uploader_ingest_folder", {
        folderPath,
      });
      setSession(nextSession);
      setShowDetails(false);
      setBanner(null);
    } catch (error) {
      setBanner(String(error));
    }
  }

  async function handleDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragActive(false);

    const paths = Array.from(event.dataTransfer.files)
      .map((file) => (file as File & { path?: string }).path)
      .filter((path): path is string => Boolean(path));

    if (paths.length === 0) {
      setBanner("Drop a folder from Finder or use Choose Folder.");
      return;
    }

    await handleFolderSelection(paths[0]);
  }

  async function startUpload() {
    if (!session || !selectedEventSlug) {
      return;
    }

    try {
      const nextSession = await invoke<UploadSessionState>("uploader_start_upload", {
        request: {
          sessionId: session.sessionId,
          backendBaseUrl: BACKEND_BASE_URL,
          eventSlug: selectedEventSlug,
          concurrency: 4,
        },
      });
      setSession(nextSession);
      setShowDetails(true);
    } catch (error) {
      setBanner(String(error));
    }
  }

  async function cancelUpload() {
    if (!session) {
      return;
    }

    try {
      await invoke("uploader_cancel", { sessionId: session.sessionId });
    } catch (error) {
      setBanner(String(error));
    }
  }

  async function resetSession() {
    if (!session) {
      return;
    }

    try {
      await invoke("uploader_reset", { sessionId: session.sessionId });
      setSession(null);
      setShowDetails(false);
    } catch (error) {
      setBanner(String(error));
    }
  }

  async function retryFailed() {
    if (!session) {
      return;
    }
    const failedPaths = session.items
      .filter((item) => item.status === "FAILED" || item.status === "CANCELLED")
      .map((item) => item.sourcePath);
    await resetSession();
    if (failedPaths.length > 0) {
      try {
        const nextSession = await invoke<UploadSessionState>("uploader_ingest_paths", {
          paths: failedPaths,
        });
        setSession(nextSession);
      } catch (error) {
        setBanner(String(error));
      }
    }
  }

  async function signOut() {
    const status = await invoke<AuthStatus>("auth_clear");
    setAuth(status);
    setEvents([]);
    setSelectedEventSlug("");
    setSession(null);
    setBanner(null);
  }

  const readyCount = session ? countByStatus(session.items, ["DISCOVERED"]) : 0;
  const skippedCount = session
    ? countByStatus(session.items, ["SKIPPED_SUBDIRECTORY", "SKIPPED_UNSUPPORTED"])
    : 0;
  const completedCount = session ? countByStatus(session.items, ["SUCCEEDED"]) : 0;
  const failedCount = session ? countByStatus(session.items, ["FAILED", "CANCELLED"]) : 0;
  const totalCount = session?.items.length ?? 0;
  const resolvedCount = session
    ? countByStatus(session.items, [
        "SUCCEEDED",
        "FAILED",
        "CANCELLED",
        "SKIPPED_SUBDIRECTORY",
        "SKIPPED_UNSUPPORTED",
      ])
    : 0;

  return (
    <div className="app-shell">
      <header className="toolbar">
        <div>
          <p className="eyebrow">event Face Locator</p>
          <h1>event Face Locator</h1>
        </div>

        <div className="toolbar-actions">
          <div className="auth-chip">
            {auth.authenticated ? (
              <>
                <span>Signed in {auth.tokenPreview}</span>
                <button type="button" onClick={signOut}>Sign out</button>
              </>
            ) : (
              <button type="button" onClick={() => void handleBrowserSignIn()} disabled={signingIn}>
                {signingIn ? "Waiting…" : "Sign in"}
              </button>
            )}
          </div>

          <label className="event-select">
            <span>Event</span>
            <select
              value={selectedEventSlug}
              disabled={!auth.authenticated || events.length === 0}
              onChange={(event) => setSelectedEventSlug(event.target.value)}
            >
              {events.map((event) => (
                <option key={event.id} value={event.slug}>
                  {event.title}
                </option>
              ))}
            </select>
          </label>

          <button type="button" onClick={() => void handleFolderSelection()} disabled={!auth.authenticated}>
            Choose Folder…
          </button>
        </div>
      </header>

      {banner ? <div className="banner">{banner}</div> : null}

      <main className="content">
        {!auth.authenticated ? (
          <section className="empty-state">
            <h2>Sign in to upload photos</h2>
            <p>Use your browser to complete admin sign-in, then return here.</p>
            <div className="summary-actions">
              <button type="button" onClick={() => void handleBrowserSignIn()} disabled={signingIn}>
                {signingIn ? "Waiting for browser sign-in…" : "Sign in in browser"}
              </button>
              <button type="button" className="details-toggle" onClick={() => setShowTokenSheet(true)}>
                Paste bearer token…
              </button>
            </div>
          </section>
        ) : (
          <>
            <section
              className={`drop-zone ${dragActive ? "drop-zone-active" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(event) => void handleDrop(event)}
            >
              <h2>{session ? "Folder ready to upload" : "Drop a folder to upload"}</h2>
              <p>Scans top-level files only</p>
              <p>Resizes to 1920px max edge (no upscaling)</p>
            </section>

            {session ? (
              <section className="summary-card">
                <div className="summary-grid">
                  <div>
                    <span className="label">Event</span>
                    <strong>{selectedEvent?.title ?? "No event selected"}</strong>
                  </div>
                  <div>
                    <span className="label">Folder</span>
                    <strong>{session.folderPath ?? "n/a"}</strong>
                  </div>
                  <div>
                    <span className="label">Ready</span>
                    <strong>{readyCount} photos</strong>
                  </div>
                  <div>
                    <span className="label">Skipped</span>
                    <strong>{skippedCount}</strong>
                  </div>
                </div>

                <div className="summary-actions">
                  {session.status === "READY" ? (
                    <button type="button" onClick={() => void startUpload()} disabled={!selectedEventSlug || readyCount === 0}>
                      Upload {readyCount} photos
                    </button>
                  ) : null}
                  {session.status === "RUNNING" || session.status === "CANCELLING" ? (
                    <button type="button" className="danger" onClick={() => void cancelUpload()}>
                      Stop
                    </button>
                  ) : null}
                  {session.status === "COMPLETED" || session.status === "CANCELLED" ? (
                    <>
                      {failedCount > 0 ? (
                        <button type="button" onClick={() => void retryFailed()}>
                          Retry failed ({failedCount})
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(reportForSession(session, selectedEvent)).catch((error) => {
                            setBanner(String(error));
                          });
                        }}
                      >
                        Copy report
                      </button>
                      <button type="button" onClick={() => void resetSession()}>
                        Upload another folder…
                      </button>
                    </>
                  ) : null}
                </div>

                <button type="button" className="details-toggle" onClick={() => setShowDetails((current) => !current)}>
                  {showDetails ? "Hide details" : "Show details"}
                </button>

                {showDetails ? (
                  <ul className="queue-list">
                    {session.items.map((item) => (
                      <li key={item.itemId} className="queue-row">
                        <div>
                          <strong>{item.fileName}</strong>
                          <span>{item.sourcePath}</span>
                        </div>
                        <div>
                          <span>{statusLabel(item.status)}</span>
                          {item.error ? <small>{item.error}</small> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ) : null}
          </>
        )}
      </main>

      {session ? (
        <footer className="status-strip">
          <span>
            {session.status === "RUNNING"
              ? `Uploading ${resolvedCount}/${totalCount}`
              : session.status === "COMPLETED"
                ? `Upload complete ${resolvedCount}/${totalCount}`
                : session.status === "CANCELLED"
                  ? `Upload stopped ${resolvedCount}/${totalCount}`
                  : `Ready ${readyCount}/${totalCount}`}
          </span>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${totalCount > 0 ? (resolvedCount / totalCount) * 100 : 0}%` }}
            />
          </div>
          <span>
            Failed {failedCount} · Skipped {skippedCount}
          </span>
        </footer>
      ) : null}

      {showTokenSheet ? (
        <div className="sheet-backdrop" role="presentation" onClick={() => setShowTokenSheet(false)}>
          <div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="token-sheet-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="token-sheet-title">Sign in</h2>
            <p className="sheet-copy">Paste a bearer token only if browser handoff is unavailable.</p>
            <label>
              <span>Bearer token</span>
              <input
                autoFocus
                type="password"
                value={tokenDraft}
                onChange={(event) => setTokenDraft(event.target.value)}
                placeholder="Paste bearer token"
              />
            </label>
            {authError ? <p className="error">{authError}</p> : null}
            <div className="sheet-actions">
              <button type="button" onClick={() => setShowTokenSheet(false)}>Cancel</button>
              <button type="button" onClick={() => void handleTokenSubmit()} disabled={!tokenDraft.trim()}>
                Sign in
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
