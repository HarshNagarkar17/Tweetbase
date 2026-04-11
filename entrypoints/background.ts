import {
  allSavedTweetIds,
  createFolder,
  deleteFolder,
  getDefaultFolderId,
  moveTweet,
  readState,
  removeTweetFromFolder,
  renameFolder,
  saveTweet,
  writeState,
} from '@/lib/storage';
import type { BookmarkMessage, BookmarkState } from '@/lib/types';

async function withState<T>(mutator: (state: BookmarkState) => T | Promise<T>, persist = true): Promise<T> {
  const state = await readState();
  const result = await mutator(state);
  if (persist) {
    await writeState(state);
  }
  return result;
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((rawMessage: BookmarkMessage, _sender, sendResponse) => {
    if (!rawMessage || typeof rawMessage !== 'object' || !('type' in rawMessage)) {
      return undefined;
    }

    const reply = async () => {
      switch (rawMessage.type) {
        case 'getState':
          return readState();
        case 'getSaveStatusBatch':
          return readState().then((state) => {
            const allIds = allSavedTweetIds(state);
            const status: Record<string, boolean> = {};
            for (const id of rawMessage.tweetIds) {
              status[id] = allIds.has(id);
            }
            return status;
          });
        case 'createFolder':
          return withState((state) => {
            const folder = createFolder(state, rawMessage.name);
            return { ok: !!folder, folder };
          });
        case 'renameFolder':
          return withState((state) => ({
            ok: renameFolder(state, rawMessage.folderId, rawMessage.name),
          }));
        case 'deleteFolder':
          return withState((state) => ({
            ok: deleteFolder(state, rawMessage.folderId),
          }));
        case 'saveTweet':
          return withState((state) => {
            let folderId = rawMessage.folderId ?? getDefaultFolderId();
            if (rawMessage.newFolderName?.trim()) {
              const folder = createFolder(state, rawMessage.newFolderName);
              if (folder) {
                folderId = folder.id;
              }
            }
            return saveTweet(state, folderId, rawMessage.tweet);
          });
        case 'removeTweetFromFolder':
          return withState((state) => ({
            ok: removeTweetFromFolder(state, rawMessage.folderId, rawMessage.tweetId),
          }));
        case 'moveTweet':
          return withState((state) =>
            moveTweet(state, rawMessage.tweetId, rawMessage.fromFolderId, rawMessage.toFolderId),
          );
        default:
          return undefined;
      }
    };

    reply()
      .then((result) => sendResponse(result))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unknown error';
        sendResponse({ ok: false, error: message });
      });

    return true;
  });
});
