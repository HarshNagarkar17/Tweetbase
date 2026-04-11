import type { BookmarkMessage } from '@/lib/types';

export async function sendBookmarkMessage<T>(message: BookmarkMessage): Promise<T> {
  return browser.runtime.sendMessage(message) as Promise<T>;
}
