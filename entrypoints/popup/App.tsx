import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { sendBookmarkMessage } from "@/lib/messaging";
import { BOOKMARK_STORAGE_KEY } from "@/lib/storage";
import { savedTweetShowsAttachmentIcon } from "@/lib/tweetMedia";
import type { BookmarkState, Folder, SavedTweet } from "@/lib/types";
import "./App.css";

type TweetRow = SavedTweet & { folderId: string };

type AppProps = {
  fullPage?: boolean;
};

function App({ fullPage = false }: AppProps) {
  const [state, setState] = useState<BookmarkState | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string>("default");
  const [newFolderName, setNewFolderName] = useState("");
  const [renameDraft, setRenameDraft] = useState<{
    folderId: string;
    value: string;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    folderId: string;
    x: number;
    y: number;
  } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState("");

  const folders = state?.folders ?? [];

  const rows = useMemo<TweetRow[]>(() => {
    if (!state) return [];
    const list: TweetRow[] = [];
    for (const folder of state.folders) {
      const ids = state.folderTweetIds[folder.id] ?? [];
      for (const id of ids) {
        const tweet = state.tweets[id];
        if (tweet) list.push({ ...tweet, folderId: folder.id });
      }
    }
    return list;
  }, [state]);

  const filteredRows = useMemo(
    () => rows.filter((row) => row.folderId === selectedFolder),
    [rows, selectedFolder],
  );

  async function loadState() {
    const data = await sendBookmarkMessage<BookmarkState>({ type: "getState" });
    setState(data);
    if (!data.folders.find((folder) => folder.id === selectedFolder)) {
      setSelectedFolder(data.folders[0]?.id ?? "default");
    }
  }

  useEffect(() => {
    loadState().catch(() => setFeedback("Failed to load bookmarks."));
    const onStorageChanged: Parameters<
      typeof browser.storage.onChanged.addListener
    >[0] = (changes, areaName) => {
      if (areaName !== "local" || !changes[BOOKMARK_STORAGE_KEY]) return;
      loadState().catch(() => null);
    };
    browser.storage.onChanged.addListener(onStorageChanged);
    return () => browser.storage.onChanged.removeListener(onStorageChanged);
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    let removeListener: (() => void) | undefined;
    const timeoutId = window.setTimeout(() => {
      const onDown = (e: globalThis.MouseEvent) => {
        if (contextMenuRef.current?.contains(e.target as Node)) return;
        setContextMenu(null);
      };
      document.addEventListener("mousedown", onDown);
      removeListener = () => document.removeEventListener("mousedown", onDown);
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
      removeListener?.();
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!renameDraft) return;
    const timeoutId = window.setTimeout(
      () => renameInputRef.current?.focus(),
      0,
    );
    const onDown = (e: globalThis.MouseEvent) => {
      if (renameInputRef.current?.contains(e.target as Node)) return;
      setRenameDraft(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener("mousedown", onDown);
    };
  }, [renameDraft]);

  async function createFolder() {
    if (!newFolderName.trim()) return;
    const result = await sendBookmarkMessage<{ ok: boolean }>({
      type: "createFolder",
      name: newFolderName,
    });
    if (!result.ok) {
      setFeedback("Folder could not be created.");
      return;
    }
    setNewFolderName("");
    await loadState();
  }

  async function deleteFolder(folder: Folder) {
    const result = await sendBookmarkMessage<{ ok: boolean }>({
      type: "deleteFolder",
      folderId: folder.id,
    });
    if (!result.ok) {
      setFeedback("Folder cannot be deleted.");
      return;
    }
    if (selectedFolder === folder.id) setSelectedFolder("default");
    await loadState();
  }

  async function saveRename() {
    if (!renameDraft?.value.trim()) return;
    const result = await sendBookmarkMessage<{ ok: boolean }>({
      type: "renameFolder",
      folderId: renameDraft.folderId,
      name: renameDraft.value,
    });
    if (!result.ok) {
      setFeedback("Rename failed.");
      return;
    }
    setRenameDraft(null);
    await loadState();
  }

  function openTabContextMenu(
    e: MouseEvent<HTMLButtonElement>,
    folderId: string,
  ) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ folderId, x: e.clientX, y: e.clientY });
  }

  function startRenameFromContext(folder: Folder) {
    setContextMenu(null);
    setRenameDraft({ folderId: folder.id, value: folder.name });
  }

  async function deleteFolderFromContext(folder: Folder) {
    setContextMenu(null);
    if (!window.confirm(`Delete folder “${folder.name}”?`)) return;
    await deleteFolder(folder);
  }

  async function removeFromFolder(tweetId: string, folderId: string) {
    await sendBookmarkMessage<{ ok: boolean }>({
      type: "removeTweetFromFolder",
      tweetId,
      folderId,
    });
    await loadState();
  }

  async function moveToFolder(
    tweetId: string,
    fromFolderId: string,
    toFolderId: string,
  ) {
    if (!toFolderId || fromFolderId === toFolderId) return;
    await sendBookmarkMessage<{ moved: boolean }>({
      type: "moveTweet",
      tweetId,
      fromFolderId,
      toFolderId,
    });
    await loadState();
  }

  function openManagerPage() {
    window.open("/manager.html", "_blank");
  }

  function truncateText(text: string, maxLength = 180) {
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength).trimEnd()}...`;
  }

  return (
    <div className={`app${fullPage ? " full-page" : ""}`}>
      {/* ── Header ── */}
      <div className="header">
        <div className="header-title">
          <h1>Bookmarks</h1>
          <p className="muted">
            {folders.find((f) => f.id === selectedFolder)
              ? `${filteredRows.length} saved tweet${filteredRows.length !== 1 ? "s" : ""}`
              : "Organize saved tweets"}
          </p>
        </div>
        {!fullPage && (
          <button
            className="icon-btn"
            onClick={() => openManagerPage()}
            title="Open full view"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
              <path d="M8 2h4v4M12 2 6.5 7.5M5 3H2.5A.5.5 0 0 0 2 3.5v8a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5V9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
      </div>

      {/* ── Folders ── */}
      <div className="folders-panel">
        <div className="tabs">
          {folders.map((folder) => {
            const count = state?.folderTweetIds[folder.id]?.length ?? 0;
            const isRenaming = renameDraft?.folderId === folder.id;
            return (
              <div key={folder.id} className="tab-slot">
                {isRenaming ? (
                  <input
                    ref={renameInputRef}
                    className="tab-edit-input"
                    value={renameDraft.value}
                    onChange={(event) =>
                      setRenameDraft((d) =>
                        d ? { ...d, value: event.target.value } : d,
                      )
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void saveRename();
                      if (event.key === "Escape") setRenameDraft(null);
                    }}
                    maxLength={80}
                    placeholder="Folder name"
                  />
                ) : (
                  <button
                    type="button"
                    className={`tab${selectedFolder === folder.id ? " active" : ""}`}
                    onClick={() => setSelectedFolder(folder.id)}
                    onContextMenu={(e) => openTabContextMenu(e, folder.id)}
                  >
                    {folder.name}
                    {count > 0 && (
                      <span style={{ opacity: 0.55, marginLeft: 5 }}>{count}</span>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="new-folder-row">
          <input
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void createFolder(); }}
            placeholder="New folder…"
            maxLength={80}
          />
          <button type="button" onClick={() => createFolder()}>
            Add
          </button>
        </div>
      </div>

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="folder-context-menu"
          style={{
            position: "fixed",
            left: Math.min(contextMenu.x, window.innerWidth - 170),
            top: Math.min(contextMenu.y, window.innerHeight - 110),
          }}
          role="menu"
        >
          <button
            type="button"
            className="menu-item"
            role="menuitem"
            onClick={() => {
              const f = folders.find((x) => x.id === contextMenu.folderId);
              if (f) startRenameFromContext(f);
            }}
          >
            Rename
          </button>
          <button
            type="button"
            className="menu-item danger"
            role="menuitem"
            disabled={contextMenu.folderId === "default"}
            onClick={() => {
              const f = folders.find((x) => x.id === contextMenu.folderId);
              if (f) void deleteFolderFromContext(f);
            }}
          >
            Delete
          </button>
        </div>
      )}

      {/* ── Tweet list ── */}
      <div className="tweet-list">
        {filteredRows.length === 0 && (
          <p className="tweet-empty">No saved tweets in this folder.</p>
        )}
        {filteredRows.map((row) => (
          <article key={`${row.folderId}:${row.id}`} className="tweet">
            <div className="tweet-header">
              <div className="tweet-author">
                <strong>{row.authorName || row.authorHandle || "Unknown"}</strong>
                <span>{row.authorHandle}</span>
              </div>
              {savedTweetShowsAttachmentIcon(row) && (
                <span
                  className="tweet-attachment-icon"
                  title="Contains image or video"
                  aria-label="Tweet has image or video"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </span>
              )}
            </div>

            <p className="tweet-body">
              {truncateText(row.text || "(No text extracted)")}
            </p>

            <div className="tweet-footer">
              <a href={row.url} target="_blank" rel="noreferrer">
                View on X ↗
              </a>
              <div className="tweet-actions">
                <select
                  onChange={(event) =>
                    moveToFolder(row.id, row.folderId, event.target.value)
                  }
                  defaultValue=""
                >
                  <option value="" disabled>
                    Move…
                  </option>
                  {folders
                    .filter((folder) => folder.id !== row.folderId)
                    .map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                </select>
                <button
                  className="danger"
                  onClick={() => removeFromFolder(row.id, row.folderId)}
                >
                  Remove
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <p className="status-bar">{feedback}</p>
    </div>
  );
}

export default App;
