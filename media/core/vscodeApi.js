// vscodeApi.js — acquireVsCodeApi() can only be called once per webview.
// Import getVsCodeApi() everywhere instead of calling it directly.
let api = null;

export function getVsCodeApi() {
  if (!api) {
    api = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null;
  }
  return api;
}