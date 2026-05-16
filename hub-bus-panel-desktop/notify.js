// notify.js — optional renderer-side helper.
//
// The desktop copy of splicer.html already inlines a `maybeNotify(env)`
// function that uses the standard Web Notification API and falls back to
// the `window.coworkNotify` IPC helper exposed by preload.js. So this file
// is **not** strictly required for notifications to work.
//
// It's kept and listed in package.json's `build.files` so the layout
// matches the original spec, and so future renderer-side patches that
// shouldn't be hot-loaded into the original hub-bus-panel/splicer.html
// (browser version) have an obvious home.
//
// To inject this file into the renderer, set
//   webPreferences.preload = path.join(__dirname, 'preload.js')
// in main.js, then in preload.js add:
//   require('./notify.js');
// (We don't currently do that — preload.js stays minimal.)

'use strict';

// Request notification permission eagerly so the first @zack envelope can
// fire a toast without a UI prompt. Safe to call repeatedly.
function ensureNotificationPermission() {
  try {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(function () { /* ignore */ });
    }
  } catch (e) { /* ignore */ }
}

if (typeof window !== 'undefined') {
  // Run after DOM is ready so the splicer has a chance to wire its own
  // notification path first.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureNotificationPermission, { once: true });
  } else {
    ensureNotificationPermission();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ensureNotificationPermission };
}
