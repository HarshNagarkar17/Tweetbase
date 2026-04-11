export interface SavedTweet {
  id: string;
  text: string;
  authorHandle: string;
  authorName: string;
  timestamp: string;
  mediaUrls: string[];
  /** True when the tweet includes image and/or native video (including GIF-as-video). */
  hasMedia: boolean;
  url: string;
  savedAt: string;
}

export interface Folder {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface BookmarkState {
  version: 1;
  folders: Folder[];
  tweets: Record<string, SavedTweet>;
  folderTweetIds: Record<string, string[]>;
}

export type BookmarkMessage =
  | {
    type: 'getState';
  }
  | {
    type: 'getSaveStatusBatch';
    tweetIds: string[];
  }
  | {
    type: 'saveTweet';
    tweet: Omit<SavedTweet, 'savedAt'>;
    folderId?: string;
    newFolderName?: string;
  }
  | {
    type: 'removeTweetFromFolder';
    tweetId: string;
    folderId: string;
  }
  | {
    type: 'moveTweet';
    tweetId: string;
    fromFolderId: string;
    toFolderId: string;
  }
  | {
    type: 'createFolder';
    name: string;
  }
  | {
    type: 'renameFolder';
    folderId: string;
    name: string;
  }
  | {
    type: 'deleteFolder';
    folderId: string;
  };
