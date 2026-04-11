import type { BookmarkState, Folder, SavedTweet } from '@/lib/types';

export const BOOKMARK_STORAGE_KEY = 'bookmarkState';

type StoredTweet = Omit<SavedTweet, 'hasMedia'> & Partial<Pick<SavedTweet, 'hasMedia'>>;

function normalizeSavedTweet(raw: StoredTweet): SavedTweet {
  const inferredFromUrls = (raw.mediaUrls?.length ?? 0) > 0;
  return {
    ...raw,
    mediaUrls: raw.mediaUrls ?? [],
    hasMedia: raw.hasMedia ?? inferredFromUrls,
  };
}

function normalizeBookmarkState(state: BookmarkState): BookmarkState {
  const tweets: Record<string, SavedTweet> = {};
  for (const [id, t] of Object.entries(state.tweets)) {
    tweets[id] = normalizeSavedTweet(t as StoredTweet);
  }
  return { ...state, tweets };
}

function stateNeedsTweetFieldMigration(state: BookmarkState): boolean {
  return Object.values(state.tweets).some((t) => (t as StoredTweet).hasMedia === undefined);
}
const DEFAULT_FOLDER_ID = 'default';

function nowIso(): string {
  return new Date().toISOString();
}

export function getDefaultFolderId(): string {
  return DEFAULT_FOLDER_ID;
}

function sanitizeFolderName(name: string): string {
  return name.trim().slice(0, 80);
}

function createDefaultState(): BookmarkState {
  const now = nowIso();
  const folder: Folder = {
    id: DEFAULT_FOLDER_ID,
    name: 'Saved',
    createdAt: now,
    updatedAt: now,
  };

  return {
    version: 1,
    folders: [folder],
    tweets: {},
    folderTweetIds: {
      [folder.id]: [],
    },
  };
}

export async function readState(): Promise<BookmarkState> {
  const stored = await browser.storage.local.get(BOOKMARK_STORAGE_KEY);
  const maybeState = stored[BOOKMARK_STORAGE_KEY] as BookmarkState | undefined;
  if (!maybeState) {
    const state = createDefaultState();
    await writeState(state);
    return state;
  }

  if (!maybeState.folders?.length) {
    const merged = createDefaultState();
    merged.tweets = maybeState.tweets ?? {};
    merged.folderTweetIds = maybeState.folderTweetIds ?? merged.folderTweetIds;
    const normalized = normalizeBookmarkState(merged);
    await writeState(normalized);
    return normalized;
  }

  if (stateNeedsTweetFieldMigration(maybeState)) {
    const normalized = normalizeBookmarkState(maybeState);
    await writeState(normalized);
    return normalized;
  }

  return maybeState;
}

export async function writeState(state: BookmarkState): Promise<void> {
  await browser.storage.local.set({
    [BOOKMARK_STORAGE_KEY]: state,
  });
}

export function folderTweetCount(state: BookmarkState, folderId: string): number {
  return state.folderTweetIds[folderId]?.length ?? 0;
}

export function allSavedTweetIds(state: BookmarkState): Set<string> {
  const ids = new Set<string>();
  for (const tweetIds of Object.values(state.folderTweetIds)) {
    for (const id of tweetIds) {
      ids.add(id);
    }
  }
  return ids;
}

export function createFolder(state: BookmarkState, rawName: string): Folder | null {
  const name = sanitizeFolderName(rawName);
  if (!name) {
    return null;
  }
  const existing = state.folders.find((f) => f.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    return existing;
  }
  const now = nowIso();
  const folder: Folder = {
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
  };
  state.folders.push(folder);
  state.folderTweetIds[folder.id] = [];
  return folder;
}

export function renameFolder(state: BookmarkState, folderId: string, rawName: string): boolean {
  const name = sanitizeFolderName(rawName);
  if (!name) {
    return false;
  }
  const folder = state.folders.find((f) => f.id === folderId);
  if (!folder) {
    return false;
  }
  folder.name = name;
  folder.updatedAt = nowIso();
  return true;
}

export function deleteFolder(state: BookmarkState, folderId: string): boolean {
  if (folderId === DEFAULT_FOLDER_ID) {
    return false;
  }
  const idx = state.folders.findIndex((f) => f.id === folderId);
  if (idx < 0) {
    return false;
  }
  const ids = state.folderTweetIds[folderId] ?? [];
  delete state.folderTweetIds[folderId];
  state.folders.splice(idx, 1);

  for (const tweetId of ids) {
    if (!isTweetReferenced(state, tweetId)) {
      delete state.tweets[tweetId];
    }
  }
  return true;
}

function isTweetReferenced(state: BookmarkState, tweetId: string): boolean {
  return Object.values(state.folderTweetIds).some((ids) => ids.includes(tweetId));
}

export function saveTweet(
  state: BookmarkState,
  folderId: string,
  tweet: Omit<SavedTweet, 'savedAt'>,
): { saved: boolean; reason?: string } {
  const targetFolder = state.folders.find((f) => f.id === folderId);
  if (!targetFolder) {
    return { saved: false, reason: 'Folder does not exist' };
  }
  const list = state.folderTweetIds[folderId] ?? [];
  if (list.includes(tweet.id)) {
    return { saved: false, reason: 'Tweet already saved in this folder' };
  }
  state.folderTweetIds[folderId] = [tweet.id, ...list];
  state.tweets[tweet.id] = {
    ...tweet,
    savedAt: nowIso(),
  };
  targetFolder.updatedAt = nowIso();
  return { saved: true };
}

export function removeTweetFromFolder(state: BookmarkState, folderId: string, tweetId: string): boolean {
  const list = state.folderTweetIds[folderId];
  if (!list) {
    return false;
  }
  const next = list.filter((id) => id !== tweetId);
  if (next.length === list.length) {
    return false;
  }
  state.folderTweetIds[folderId] = next;
  if (!isTweetReferenced(state, tweetId)) {
    delete state.tweets[tweetId];
  }
  return true;
}

export function moveTweet(
  state: BookmarkState,
  tweetId: string,
  fromFolderId: string,
  toFolderId: string,
): { moved: boolean; reason?: string } {
  if (fromFolderId === toFolderId) {
    return { moved: false, reason: 'Source and destination are the same' };
  }
  const from = state.folderTweetIds[fromFolderId];
  const to = state.folderTweetIds[toFolderId];
  if (!from || !to) {
    return { moved: false, reason: 'Folder missing' };
  }
  if (!from.includes(tweetId)) {
    return { moved: false, reason: 'Tweet not in source folder' };
  }
  if (to.includes(tweetId)) {
    removeTweetFromFolder(state, fromFolderId, tweetId);
    return { moved: true };
  }
  state.folderTweetIds[fromFolderId] = from.filter((id) => id !== tweetId);
  state.folderTweetIds[toFolderId] = [tweetId, ...to];
  return { moved: true };
}
