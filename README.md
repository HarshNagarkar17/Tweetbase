# TweetBase

A browser extension that replaces X's flat bookmark system with a folder-based organizer — everything stored locally on your device.

## What it does

- Injects a **Save** button into every tweet on the timeline and detail view
- On click, opens a lightweight panel to pick a folder or create one inline
- Detects and flags tweets that contain **images or video** with an attachment indicator
- Provides a clean **popup and full-page manager** to browse, move, and remove saved tweets
- All data lives in local browser storage — nothing leaves your machine

## Features

| | |
|---|---|
| Folder management | Create, rename, delete — right-click a tab to manage |
| Duplicate guard | Saving the same tweet to the same folder twice is a no-op |
| Media detection | Attachment icon shown for tweets with images, GIFs, or video |
| Move tweets | Reassign any saved tweet to a different folder via the dropdown |
| Full-page view | Open the manager in a new tab for a wider layout |

## Development

```bash
pnpm install
pnpm dev          # Chrome (hot-reload)
pnpm dev:firefox  # Firefox
```

```bash
pnpm build        # Production build (Chrome)
pnpm zip          # Packaged .zip ready for the Chrome Web Store
pnpm zip:firefox  # Packaged .zip for Firefox Add-ons
```

## Stack

- [WXT](https://wxt.dev) — browser extension framework
- React 19 + TypeScript
- Browser local storage (no backend, no sync)

## Browser support

Chrome / Chromium and Firefox. Load the `.output/chrome-mv3` folder as an unpacked extension in Chrome, or use `pnpm dev:firefox` for Firefox.
