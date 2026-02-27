# Offline Client Access Plan for `data/kjv.sqlite`

## Goal
Enable the Angular client to read KJV data from SQLite in the browser and keep it available offline.

## Plan

1. Move SQLite into shipped client assets
- Ensure `data/kjv.sqlite` is copied to `public/kjv.sqlite` before `start`, `build`, and `watch`.
- Keep this automated so app builds always use the latest DB.

2. Add browser SQLite runtime
- Use a WASM SQLite runtime (`sql.js`) in the browser.
- Ship required runtime assets (`sql-wasm.js`, `sql-wasm.wasm`) under `public/assets/sql.js/`.

3. Create a SQLite access layer
- Add a dedicated `KjvSqliteService` to initialize and query SQLite.
- Expose typed query methods (books, chapter verses, search).
- Keep SQL statements centralized in the service.

4. Migrate app data flow from JSON to SQLite
- Replace JSON-loading call sites in `KjvDataService` with SQLite-backed methods.
- Keep component contracts stable while switching the underlying data source.

5. Keep DB work off the main thread
- Move SQLite init/query work to a Web Worker.
- Use message-based API (`init`, `getBooks`, `getChapter`, `search`) between app and worker.

6. Add PWA caching for offline use
- Enable Angular service worker and add `ngsw-config.json`.
- Precache app shell plus `kjv.sqlite` and SQLite runtime assets.

7. Add startup and failure handling
- Gate app startup on DB readiness.
- Show user-visible states for first-run download, offline ready, and load failure.

8. Validate end-to-end
- Functional checks: book/chapter/verse retrieval and search.
- Offline checks: first online load, then full reload with network disabled.
- Performance checks: initial load time, query latency, memory impact.
- Accessibility regression checks after data-source migration.

## Progress Snapshot

Completed:
- Step 1 (asset prep wiring)
- Step 2 (runtime wiring)
- Step 3 (SQLite service and typed models)
- Step 4 (data flow switched from JSON loading to SQLite-backed `KjvDataService`)

Pending:
- Steps 5 through 8
