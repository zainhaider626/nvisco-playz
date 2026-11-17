/* Offline / "server unreachable" screen for the Nvisco Playz Android shell.
 *
 * Capacitor loads the live game from server.url. If that fails (no internet, server down, HTTP error),
 * the WebView shows THIS bundled page instead (server.errorPath). It checks the connection and, as soon as
 * the server answers, navigates back to the game. It runs from https://localhost inside the app, so it has
 * no access to Capacitor plugins; it uses navigator.onLine + a small request instead.
 */
(function () {
  'use strict';

  var SERVER = (window.NVISCO_SERVER_URL || '').replace(/\/+$/, '');
  var statusEl = document.getElementById('status');
  var retryBtn = document.getElementById('retry');
  var hostEl = document.getElementById('host');

  var BACKOFF = [2, 4, 8, 15, 30];       // seconds between automatic tries
  var PROBE_TIMEOUT_MS = 6000;
  var timer = null;
  var countdown = null;
  var busy = false;
  var fails = 0;

  function store(key, value) {
    try { if (value === undefined) { return window.sessionStorage.getItem(key); } window.sessionStorage.setItem(key, value); } catch (e) { /* storage blocked: fine */ }
    return null;
  }

  // If we were sent here again right after trying the server, that try failed (e.g. HTTP 502): back off.
  (function readHistory() {
    var last = parseInt(store('nv_last_try'), 10) || 0;
    var f = parseInt(store('nv_fails'), 10) || 0;
    fails = (Date.now() - last < 15000) ? f : 0;
    store('nv_fails', String(fails));
  })();

  if (!SERVER) {
    statusEl.textContent = 'This app was built without a server address. Please install the latest version.';
    retryBtn.hidden = true;
    return;
  }
  try { hostEl.textContent = new URL(SERVER).host; } catch (e) { hostEl.textContent = SERVER; }

  function setStatus(text) { statusEl.textContent = text; }

  function clearTimers() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (countdown) { clearInterval(countdown); countdown = null; }
  }

  function goToGame() {
    store('nv_last_try', String(Date.now()));
    window.location.replace(SERVER + '/');
  }

  // Any HTTP answer at all (even an error page) resolves a no-cors fetch; only network failures reject.
  function probe() {
    return new Promise(function (resolve, reject) {
      var ctrl = ('AbortController' in window) ? new AbortController() : null;
      var t = setTimeout(function () { if (ctrl) { ctrl.abort(); } reject(new Error('timeout')); }, PROBE_TIMEOUT_MS);
      fetch(SERVER + '/api/health?t=' + Date.now(), { mode: 'no-cors', cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
        .then(function () { clearTimeout(t); resolve(); })
        .catch(function (e) { clearTimeout(t); reject(e); });
    });
  }

  function scheduleRetry() {
    clearTimers();
    var secs = BACKOFF[Math.min(fails, BACKOFF.length - 1)];
    var left = secs;
    function paint() {
      var base = (navigator.onLine === false)
        ? 'No internet connection. Check your Wi-Fi or mobile data.'
        : 'Can’t reach the game right now.';
      setStatus(base + ' Trying again in ' + left + 's…');
    }
    paint();
    countdown = setInterval(function () { left -= 1; if (left > 0) { paint(); } }, 1000);
    timer = setTimeout(function () { attempt(false); }, secs * 1000);
  }

  function attempt(manual) {
    if (busy) { return; }
    clearTimers();
    if (manual) { fails = 0; store('nv_fails', '0'); }
    busy = true;
    retryBtn.disabled = true;
    setStatus('Connecting…');

    var offline = (navigator.onLine === false);
    var check = offline ? Promise.reject(new Error('offline')) : probe();
    check.then(function () {
      goToGame();
    }, function () {
      busy = false;
      retryBtn.disabled = false;
      fails += 1;
      store('nv_fails', String(fails));
      scheduleRetry();
    });
  }

  retryBtn.addEventListener('click', function () { busy = false; attempt(true); });
  window.addEventListener('online', function () { busy = false; attempt(true); });
  window.addEventListener('offline', function () { setStatus('No internet connection. Check your Wi-Fi or mobile data.'); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && !busy) { attempt(false); }
  });

  // First automatic try. If we just bounced back from a failed load, wait before trying again.
  if (fails > 0) { scheduleRetry(); } else { attempt(false); }
})();
