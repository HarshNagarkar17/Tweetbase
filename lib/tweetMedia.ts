/** URLs that are avatars, not tweet attachments. */
const EXCLUDE_MEDIA_URL = /profile_images|\/emoji\/|sticky\/default_profile_images/i;

export function urlLooksLikeTweetMedia(url: string): boolean {
  const u = url
    .trim()
    .split(/\s+/)[0]
    .split('?')[0]
    .toLowerCase();
  if (!u || EXCLUDE_MEDIA_URL.test(u)) {
    return false;
  }
  if (u.includes('pbs.twimg.com/media/')) {
    return true;
  }
  if (u.includes('pbs.twimg.com/amplify_video') || u.includes('pbs.twimg.com/ext_tw_video')) {
    return true;
  }
  if (u.includes('twimg.com/media/')) {
    return true;
  }
  if (u.includes('video.twimg.com')) {
    return true;
  }
  return false;
}

export function inferHasMediaFromUrls(urls: readonly string[]): boolean {
  return urls.some(urlLooksLikeTweetMedia);
}

export function savedTweetShowsAttachmentIcon(tweet: {
  hasMedia: boolean;
  mediaUrls?: string[];
}): boolean {
  return tweet.hasMedia || inferHasMediaFromUrls(tweet.mediaUrls ?? []);
}
