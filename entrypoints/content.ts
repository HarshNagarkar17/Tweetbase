import { sendBookmarkMessage } from '@/lib/messaging';
import { BOOKMARK_STORAGE_KEY } from '@/lib/storage';
import { urlLooksLikeTweetMedia } from '@/lib/tweetMedia';
import type { BookmarkState, Folder } from '@/lib/types';

type TweetRecord = {
  id: string;
  text: string;
  authorHandle: string;
  authorName: string;
  timestamp: string;
  mediaUrls: string[];
  hasMedia: boolean;
  url: string;
};

function collectMediaFromArticle(article: HTMLElement): { mediaUrls: string[]; hasMedia: boolean } {
  const urls = new Set<string>();
  let hasMedia = false;

  const consider = (raw: string | null | undefined) => {
    if (!raw?.trim()) {
      return;
    }
    const u = raw.trim().split(/\s+/)[0];
    urls.add(u);
    if (urlLooksLikeTweetMedia(u)) {
      hasMedia = true;
    }
  };

  article.querySelectorAll('img').forEach((img) => {
    const el = img as HTMLImageElement;
    consider(el.currentSrc || img.getAttribute('src'));
    const srcset = img.getAttribute('srcset');
    if (srcset) {
      for (const part of srcset.split(',')) {
        consider(part.trim().split(/\s+/)[0]);
      }
    }
  });

  article.querySelectorAll('video').forEach((video) => {
    hasMedia = true;
    consider(video.getAttribute('poster'));
    video.querySelectorAll('source').forEach((s) => consider(s.getAttribute('src')));
  });

  if (article.querySelector('[data-testid="tweetPhoto"]')) {
    hasMedia = true;
  }
  if (article.querySelector('[data-testid="videoComponent"], [data-testid="videoPlayer"]')) {
    hasMedia = true;
  }

  return { mediaUrls: [...urls], hasMedia };
}

const ACTION_CLASS = 'tbm-save-action';
const BADGE_CLASS = 'tbm-saved-badge';
const PROCESSED_ATTR = 'data-tbm-processed';

let folderCache: Folder[] = [];
/** Maps tweetId → folderId for every saved tweet. */
let savedStatus = new Map<string, string>();
let openPanel: HTMLDivElement | null = null;

function injectStyles() {
  if (document.getElementById('tbm-style')) {
    return;
  }
  const style = document.createElement('style');
  style.id = 'tbm-style';
  style.textContent = `
    .${ACTION_CLASS} {
      border: none;
      background: transparent;
      color: rgb(83, 100, 113);
      cursor: pointer;
      font-size: 13px;
      padding: 4px 8px;
      border-radius: 9999px;
    }
    .${ACTION_CLASS}:hover { background: rgba(29, 155, 240, 0.1); color: rgb(29, 155, 240); }
    .${ACTION_CLASS}.is-saved { color: rgb(0, 186, 124); }
    .${BADGE_CLASS} {
      margin-left: 8px;
      color: rgb(0, 186, 124);
      font-size: 12px;
      font-weight: 600;
    }
    .tbm-panel {
      position: fixed;
      z-index: 99999;
      width: 260px;
      max-height: 360px;
      overflow: auto;
      padding: 10px;
      background: #0f1419;
      color: #e7e9ea;
      border: 1px solid #2f3336;
      border-radius: 10px;
      box-shadow: rgba(255, 255, 255, 0.06) 0 0 0 1px, rgba(0, 0, 0, 0.45) 0 8px 28px;
      font: 13px/1.4 system-ui, sans-serif;
    }
    .tbm-panel h4 { margin: 0 0 8px; font-size: 13px; }
    .tbm-panel .row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    .tbm-panel input[type="text"] {
      width: 100%;
      padding: 6px 8px;
      background: #202327;
      color: #e7e9ea;
      border: 1px solid #2f3336;
      border-radius: 8px;
    }
    .tbm-panel button {
      border: 1px solid #2f3336;
      background: #1d9bf0;
      color: white;
      border-radius: 9999px;
      padding: 6px 10px;
      cursor: pointer;
    }
    .tbm-panel .secondary {
      background: transparent;
      color: #e7e9ea;
    }
    .tbm-panel .msg { margin-top: 6px; font-size: 12px; color: #86efac; }
  `;
  document.head.appendChild(style);
}

function closePanel() {
  if (openPanel) {
    openPanel.remove();
    openPanel = null;
  }
}

function parseTweetIdFromHref(href: string): string | null {
  const match = href.match(/status\/(\d+)/);
  return match?.[1] ?? null;
}

function getTweetRecord(article: HTMLElement): TweetRecord | null {
  const statusLink = article.querySelector<HTMLAnchorElement>('a[href*="/status/"]');
  if (!statusLink) {
    return null;
  }
  const id = parseTweetIdFromHref(statusLink.href);
  if (!id) {
    return null;
  }

  const textEl = article.querySelector<HTMLElement>('[data-testid="tweetText"]');
  const userNameBlock = article.querySelector<HTMLElement>('[data-testid="User-Name"]');
  const timeEl = article.querySelector<HTMLTimeElement>('time');
  const statusUrl = statusLink.href.startsWith('http') ? statusLink.href : new URL(statusLink.getAttribute('href') || '', location.origin).toString();

  const { mediaUrls, hasMedia } = collectMediaFromArticle(article);

  let authorHandle = '';
  const handleMatch = statusUrl.match(/https?:\/\/(?:x|twitter)\.com\/([^/]+)\/status\/\d+/i);
  if (handleMatch?.[1]) {
    authorHandle = `@${handleMatch[1]}`;
  }
  const authorName = userNameBlock?.querySelector('span')?.textContent?.trim() ?? '';

  return {
    id,
    text: textEl?.innerText?.trim() ?? '',
    authorHandle,
    authorName,
    timestamp: timeEl?.dateTime ?? '',
    mediaUrls,
    hasMedia,
    url: statusUrl,
  };
}

function updateSavedMarker(article: HTMLElement, isSaved: boolean) {
  const button = article.querySelector<HTMLButtonElement>(`.${ACTION_CLASS}`);
  if (button) {
    button.classList.toggle('is-saved', isSaved);
    button.textContent = isSaved ? 'Saved' : 'Save';
  }
  const badge = article.querySelector<HTMLSpanElement>(`.${BADGE_CLASS}`);
  if (!isSaved && badge) {
    badge.remove();
  }
}

async function refreshState() {
  const state = await sendBookmarkMessage<BookmarkState>({ type: 'getState' });
  folderCache = state.folders;
  savedStatus = new Map<string, string>();
  for (const [folderId, ids] of Object.entries(state.folderTweetIds)) {
    for (const id of ids) {
      savedStatus.set(id, folderId);
    }
  }
}

function createPanel(anchor: HTMLElement, article: HTMLElement) {
  closePanel();
  const initialTweet = getTweetRecord(article);
  if (!initialTweet) {
    return;
  }

  const currentFolderId = savedStatus.get(initialTweet.id);

  const panel = document.createElement('div');
  panel.className = 'tbm-panel';
  panel.innerHTML = `
    <h4>Save Tweet</h4>
    <div class="folders"></div>
    <div class="row"><input class="tbm-new-folder" type="text" placeholder="New folder name" maxlength="80" /></div>
    <div class="row">
      <button class="tbm-save">Save</button>
      <button class="secondary tbm-cancel">Cancel</button>
    </div>
    <div class="msg"></div>
  `;
  const foldersHost = panel.querySelector<HTMLDivElement>('.folders')!;
  for (const folder of folderCache) {
    const row = document.createElement('label');
    row.className = 'row';
    row.innerHTML = `<input type="radio" name="tbm-folder" value="${folder.id}" /> <span>${folder.name}</span>`;
    foldersHost.appendChild(row);
  }

  // Pre-select the folder the tweet is currently saved in, or fall back to the first.
  const targetId = currentFolderId ?? folderCache[0]?.id;
  const targetRadio = panel.querySelector<HTMLInputElement>(
    targetId ? `input[name="tbm-folder"][value="${targetId}"]` : 'input[name="tbm-folder"]',
  );
  if (targetRadio) {
    targetRadio.checked = true;
  }

  const rect = anchor.getBoundingClientRect();
  panel.style.top = `${Math.min(window.innerHeight - 380, rect.bottom + 8)}px`;
  panel.style.left = `${Math.min(window.innerWidth - 280, rect.left)}px`;
  document.body.appendChild(panel);
  openPanel = panel;

  const msg = panel.querySelector<HTMLDivElement>('.msg')!;
  panel.querySelector<HTMLButtonElement>('.tbm-cancel')?.addEventListener('click', () => closePanel());
  panel.querySelector<HTMLButtonElement>('.tbm-save')?.addEventListener('click', async () => {
    const freshTweet = getTweetRecord(article);
    if (!freshTweet) {
      msg.textContent = 'Could not read tweet';
      return;
    }
    const folderId =
      panel.querySelector<HTMLInputElement>('input[name="tbm-folder"]:checked')?.value ?? folderCache[0]?.id;
    const newFolderName = panel.querySelector<HTMLInputElement>('.tbm-new-folder')?.value.trim() ?? '';
    try {
      const result = await sendBookmarkMessage<{ saved: boolean; reason?: string }>({
        type: 'saveTweet',
        folderId,
        newFolderName,
        tweet: freshTweet,
      });
      if (result.saved) {
        msg.textContent = 'Saved';
        savedStatus.set(freshTweet.id, folderId);
        updateSavedMarker(article, true);
        setTimeout(closePanel, 400);
      } else {
        msg.textContent = result.reason ?? 'Nothing to save';
      }
    } catch {
      msg.textContent = 'Could not save right now';
    }
  });
}

function installTweetButton(article: HTMLElement) {
  if (article.getAttribute(PROCESSED_ATTR) === '1') {
    return;
  }

  const actionGroup = article.querySelector<HTMLElement>('[role="group"]');
  const tweet = getTweetRecord(article);
  if (!actionGroup || !tweet) {
    return;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = ACTION_CLASS;
  button.textContent = savedStatus.get(tweet.id) ? 'Saved' : 'Save';
  button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!folderCache.length) {
      await refreshState();
    }
    createPanel(button, article);
  });
  actionGroup.appendChild(button);
  article.setAttribute(PROCESSED_ATTR, '1');
  updateSavedMarker(article, savedStatus.has(tweet.id));
}

function processTweets(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('article[data-testid="tweet"]').forEach((article) => {
    installTweetButton(article);
  });
}

function attachObservers() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          if (node.matches?.('article[data-testid="tweet"]')) {
            installTweetButton(node);
          } else {
            processTweets(node);
          }
        }
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

export default defineContentScript({
  matches: ['*://x.com/*', '*://twitter.com/*'],
  main() {
    injectStyles();
    refreshState()
      .then(() => processTweets())
      .catch(() => processTweets());
    attachObservers();
    document.addEventListener('click', (event) => {
      if (openPanel && event.target instanceof HTMLElement && !openPanel.contains(event.target)) {
        closePanel();
      }
    });

    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local' || !changes[BOOKMARK_STORAGE_KEY]) return;
      refreshState()
        .then(() => processTweets())
        .catch(() => null);
    });
  },
});
