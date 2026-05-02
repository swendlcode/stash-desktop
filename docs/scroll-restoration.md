# Scroll Restoration on Context Change

## What this UI/UX pattern is called

This behavior is commonly called:

- **Scroll restoration** (general term)
- **Scroll reset on navigation/context change** (specific implementation)

In this project, when the user switches pack/folder context in the Browser, we intentionally reset the scroll to the top so the new `ProjectHero` / `FolderHero` is visible immediately.

## Why this pattern is useful

- Prevents users from landing mid-list in a new context
- Preserves orientation after switching folders/packs
- Makes the new hero/header state obvious right away

## Applied behavior in Stack

When `pathPrefix` changes in `BrowserPage`, the shared scroll container is moved to top:

- Trigger: folder/pack context change
- Action: `scrollTo({ top: 0, behavior: 'auto' })`
- Goal: start each new context from a predictable visual position

## Notes

- Use this for **context switches** (new folder/pack/project)
- Do not force scroll reset for tiny in-place updates, where preserving position is better
