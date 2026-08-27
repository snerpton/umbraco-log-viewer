# Change Log

## 0.2.0

- Add a "Poll for changes" toggle in the viewer toolbar to continuously
  re-read the open log file from disk, for cases where VS Code's own file
  watcher doesn't pick up external writes (e.g. network drives, Docker
  volumes). Off by default.
- Add a Refresh button to manually reload the file from disk on demand,
  primarily for use while polling is off.
- Add `umbracoLogViewer.pollForChanges` and `umbracoLogViewer.pollInterval`
  settings to control the default polling state and interval.

## 0.1.0

- Initial release: CLEF log viewer for UmbracoTraceLog.*.json files with
  template rendering, level filtering, search, expandable properties and
  exceptions, live tail, and raw-JSON copy.
