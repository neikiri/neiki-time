/**
 * Neiki's Time v1.1.0
 * Ultra-precise time display library — no frameworks, no dependencies.
 *
 * Synchronizes with multiple public time APIs using NTP-like round-trip
 * latency estimation, then renders via performance.now() for drift-free
 * sub-millisecond ticking between syncs.
 *
 * Usage:
 *   <div data-neiki-time></div>
 *   <script src="neiki-time.js"></script>
 *   <script>NeikiTime.init();</script>
 *
 * Or with options:
 *   NeikiTime.init({
 *     selector: '[data-neiki-time]',
 *     format: 'DD.MM.YYYY HH:mm:ss.SSS',
 *     timezone: 'Europe/Prague',
 *     locale: 'cs-CZ',
 *     showDate: true,
 *     showMs: true,
 *     showOffset: false,
 *     syncInterval: 60000,
 *     theme: 'auto', // 'light' | 'dark' | 'auto' | 'none'
 *     fontFamily: "'Oxanium', sans-serif",
 *     fontSize: '2rem',
 *     fontWeight: 600
 *   });
 *
 * CDN:  Just include the script — zero dependencies.
 *
 * @license MIT
 */
(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NeikiTime = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ====================================================================
   *  CONSTANTS
   * ==================================================================== */

  var VERSION = "1.1.0";

  /** Public time API endpoints — we query several and pick the best. */
  var TIME_APIS = [
    {
      name: "WorldTimeAPI",
      url: "https://worldtimeapi.org/api/ip",
      parse: function (json) {
        return new Date(json.utc_datetime).getTime();
      },
    },
    {
      name: "TimeAPI.io",
      url: "https://timeapi.io/api/time/current/zone?timeZone=UTC",
      parse: function (json) {
        // timeapi.io returns { year, month, day, hour, minute, seconds, milliSeconds, ... }
        var d = new Date(
          Date.UTC(
            json.year,
            json.month - 1,
            json.day,
            json.hour,
            json.minute,
            json.seconds,
            json.milliSeconds || 0
          )
        );
        return d.getTime();
      },
    },
  ];

  var DEFAULT_OPTIONS = {
    selector: "[data-neiki-time]",
    format: null, // custom template; null = display controlled by showDate/showMs
    timezone: undefined, // undefined = local
    locale: undefined, // undefined = browser default
    showDate: true,
    showMs: true,
    showOffset: false,
    syncInterval: 60000, // re-sync every 60 s
    syncSamples: 3, // samples per API per sync round
    theme: "auto", // 'light' | 'dark' | 'auto' | 'none'
    fontFamily: null, // CSS font-family value; null = built-in monospace stack
    fontSize: null, // CSS font-size value; null = built-in size
    fontWeight: null, // CSS font-weight value; null = browser default
    onSync: null, // callback(offsetInfo)
    onSyncError: null, // callback(error) after a failed sync round
    onTick: null, // callback(preciseDate)
  };

  /* ====================================================================
   *  INTERNAL STATE
   * ==================================================================== */

  var _options = {};
  var _elements = [];
  var _offset = 0; // ms, added to Date.now() to get true time
  var _synced = false;
  var _syncInProgress = false;
  var _rafId = null;
  var _syncTimerId = null;
  var _lastSyncInfo = null;

  // For high-res ticking we anchor a (perfNow, trueMs) pair at sync time
  var _anchorPerf = 0; // performance.now() at anchor
  var _anchorTrue = 0; // true UTC ms at anchor

  /* ====================================================================
   *  HELPERS
   * ==================================================================== */

  function merge(defaults, overrides) {
    var out = {};
    for (var k in defaults) {
      if (defaults.hasOwnProperty(k)) {
        out[k] = overrides && overrides.hasOwnProperty(k) ? overrides[k] : defaults[k];
      }
    }
    return out;
  }

  function perfNow() {
    return performance && performance.now ? performance.now() : Date.now();
  }

  /** Fetch JSON with timeout. Returns promise. */
  function fetchJson(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.timeout = timeoutMs || 5000;
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (e) {
            reject(e);
          }
        } else {
          reject(new Error("HTTP " + xhr.status));
        }
      };
      xhr.onerror = function () {
        reject(new Error("Network error"));
      };
      xhr.ontimeout = function () {
        reject(new Error("Timeout"));
      };
      xhr.send();
    });
  }

  /* ====================================================================
   *  TIME SYNC ENGINE
   * ==================================================================== */

  /**
   * Single sample from one API.
   * Returns { offset, rtt } where offset = serverTime - localTime,
   * adjusted by half the round-trip time.
   */
  function takeSample(api) {
    var t0 = Date.now();
    var p0 = perfNow();
    return fetchJson(api.url, 4000).then(function (json) {
      var t1 = Date.now();
      var rtt = t1 - t0;
      var serverUtc = api.parse(json);
      // NTP-style: true time ≈ serverUtc + rtt/2 (server processed ~mid-trip)
      // offset = trueTime - localMidpoint
      var localMid = t0 + rtt / 2;
      var offset = serverUtc - localMid;
      return { offset: offset, rtt: rtt, api: api.name };
    });
  }

  /** Take N samples from one API and return the one with lowest RTT. */
  function bestSample(api, n) {
    var tasks = [];
    for (var i = 0; i < n; i++) {
      tasks.push(
        takeSample(api).catch(function () {
          return null;
        })
      );
    }
    return Promise.all(tasks).then(function (results) {
      var best = null;
      for (var j = 0; j < results.length; j++) {
        if (results[j] && (best === null || results[j].rtt < best.rtt)) {
          best = results[j];
        }
      }
      return best;
    });
  }

  /** Full sync: query all APIs, pick best overall sample. */
  function syncTime() {
    if (_syncInProgress) return Promise.resolve();
    _syncInProgress = true;

    var tasks = TIME_APIS.map(function (api) {
      return bestSample(api, _options.syncSamples || 3);
    });

    return Promise.all(tasks)
      .then(function (results) {
        var best = null;
        for (var i = 0; i < results.length; i++) {
          if (results[i] && (best === null || results[i].rtt < best.rtt)) {
            best = results[i];
          }
        }

        if (!best) {
          throw new Error("All configured time APIs failed to synchronize.");
        }

        _offset = best.offset;
        // Set high-res anchor
        _anchorPerf = perfNow();
        _anchorTrue = Date.now() + _offset;
        _synced = true;
        _lastSyncInfo = {
          offset: best.offset,
          rtt: best.rtt,
          api: best.api,
          time: new Date(),
        };
        if (typeof _options.onSync === "function") {
          _options.onSync(_lastSyncInfo);
        }
      })
      .catch(function (error) {
        if (typeof _options.onSyncError === "function") {
          _options.onSyncError(error);
        }
      })
      .then(function () {
        _syncInProgress = false;
      });
  }

  /* ====================================================================
   *  PRECISE CURRENT TIME
   * ==================================================================== */

  /** Returns the best-estimate UTC timestamp in ms. */
  function preciseNow() {
    if (!_synced) {
      return Date.now();
    }
    // Use performance.now() delta from anchor for drift-free ticking
    var elapsed = perfNow() - _anchorPerf;
    return _anchorTrue + elapsed;
  }

  /** Returns a Date object representing precise current time. */
  function preciseDate() {
    return new Date(preciseNow());
  }

  /* ====================================================================
   *  FORMATTING
   * ==================================================================== */

  function pad(n, len) {
    var s = String(n);
    while (s.length < (len || 2)) s = "0" + s;
    return s;
  }

  /**
   * Format a Date to a display string.
   * Uses Intl.DateTimeFormat when timezone / locale are specified,
   * otherwise does manual formatting for maximum control.
   */
  function formatTime(date, opts) {
    var tz = opts.timezone;
    var loc = opts.locale || undefined;
    var parts = {};

    if (tz) {
      // Use Intl to convert to target timezone
      var f = new Intl.DateTimeFormat(loc || "en-GB", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      var fp = f.formatToParts(date);
      fp.forEach(function (p) {
        parts[p.type] = p.value;
      });
    } else {
      parts.year = String(date.getFullYear());
      parts.month = pad(date.getMonth() + 1);
      parts.day = pad(date.getDate());
      parts.hour = pad(date.getHours());
      parts.minute = pad(date.getMinutes());
      parts.second = pad(date.getSeconds());
    }

    // Milliseconds are always from the precise timestamp
    var ms = pad(date.getMilliseconds(), 3);
    var out;

    if (typeof opts.format === "string" && opts.format) {
      var formatTokens = {
        YYYY: parts.year,
        YY: parts.year.slice(-2),
        DD: parts.day,
        MM: parts.month,
        HH: parts.hour,
        mm: parts.minute,
        ss: parts.second,
        SSS: ms,
      };
      out = opts.format.replace(/YYYY|SSS|YY|DD|MM|HH|mm|ss/g, function (token) {
        return formatTokens[token];
      });
    } else {
      var timePart = parts.hour + ":" + parts.minute + ":" + parts.second;
      if (opts.showMs) {
        timePart += "." + ms;
      }

      var datePart = parts.day + "." + parts.month + "." + parts.year;
      out = (opts.showDate ? datePart + " " : "") + timePart;
    }

    if (opts.showOffset && _lastSyncInfo) {
      out +=
        "  [offset " +
        (_lastSyncInfo.offset >= 0 ? "+" : "") +
        _lastSyncInfo.offset.toFixed(0) +
        " ms, RTT " +
        _lastSyncInfo.rtt +
        " ms, via " +
        _lastSyncInfo.api +
        "]";
    }

    return out;
  }

  /* ====================================================================
   *  RENDERING
   * ==================================================================== */

  function renderTick() {
    var now = preciseDate();

    if (typeof _options.onTick === "function") {
      _options.onTick(now);
    }

    var text = formatTime(now, _options);

    for (var i = 0; i < _elements.length; i++) {
      var el = _elements[i];
      // Per-element overrides via data attributes
      var elOpts = merge(_options, {
        timezone: el.getAttribute("data-neiki-tz") || _options.timezone,
        showDate:
          el.hasAttribute("data-neiki-nodate") ? false : _options.showDate,
        showMs:
          el.hasAttribute("data-neiki-noms") ? false : _options.showMs,
        showOffset:
          el.hasAttribute("data-neiki-offset") ? true : _options.showOffset,
      });

      var elText =
        elOpts === _options ? text : formatTime(now, elOpts);
      el.textContent = elText;

      // Apply synced indicator
      if (_synced && !el.classList.contains("neiki-synced")) {
        el.classList.add("neiki-synced");
      }
    }

    _rafId = requestAnimationFrame(renderTick);
  }

  /* ====================================================================
   *  THEME / CSS INJECTION
   * ==================================================================== */

  function injectStyles(theme, fontFamily, fontSize, fontWeight) {
    function cssValue(value) {
      return typeof value === "string" && value.trim()
        ? value.trim()
        : typeof value === "number" && isFinite(value)
          ? String(value)
          : null;
    }

    var customFont = cssValue(fontFamily);
    var customSize = cssValue(fontSize);
    var customWeight = cssValue(fontWeight);
    var typography = "";

    if (theme !== "none" || customFont) {
      typography +=
        "font-family:" +
        (customFont ||
          "'JetBrains Mono','Fira Code','SF Mono','Cascadia Code',Consolas,monospace") +
        ";";
    }
    if (customSize) typography += "font-size:" + customSize + ";";
    if (customWeight) typography += "font-weight:" + customWeight + ";";

    var typographyCSS = typography ? "[data-neiki-time]{" + typography + "}" : "";
    if (theme === "none" && !typographyCSS) return;

    var dark =
      "background:#0d1117;color:#58a6ff;border-color:#30363d;";
    var light =
      "background:#ffffff;color:#0550ae;border-color:#d0d7de;";

    if (theme === "none") {
      var typographyStyle = document.getElementById("neiki-time-styles");
      if (!typographyStyle) {
        typographyStyle = document.createElement("style");
        typographyStyle.id = "neiki-time-styles";
        document.head.appendChild(typographyStyle);
      }
      typographyStyle.textContent = typographyCSS;
      return;
    }

    var base =
      typographyCSS +
      "[data-neiki-time]{" +
      (customSize ? "" : "font-size:1.35rem;") +
      "font-variant-numeric:tabular-nums;" +
      "letter-spacing:.04em;" +
      "padding:.45em .9em;" +
      "border-radius:8px;" +
      "border:1px solid;" +
      "display:inline-block;" +
      "transition:opacity .4s,box-shadow .4s;" +
      "opacity:.55;" +
      "}" +
      "[data-neiki-time].neiki-synced{" +
      "opacity:1;" +
      "box-shadow:0 0 12px rgba(88,166,255,.25);" +
      "}";

    var themeCSS = "";
    if (theme === "dark") {
      themeCSS = "[data-neiki-time]{" + dark + "}";
    } else if (theme === "light") {
      themeCSS = "[data-neiki-time]{" + light + "}";
    } else {
      // auto — use prefers-color-scheme
      themeCSS =
        "@media(prefers-color-scheme:dark){[data-neiki-time]{" +
        dark +
        "}}" +
        "@media(prefers-color-scheme:light){[data-neiki-time]{" +
        light +
        "}}";
    }

    var style = document.getElementById("neiki-time-styles");
    if (!style) {
      style = document.createElement("style");
      style.id = "neiki-time-styles";
      document.head.appendChild(style);
    }
    style.textContent = base + themeCSS;
  }

  /* ====================================================================
   *  PUBLIC API
   * ==================================================================== */

  function init(userOpts) {
    _options = merge(DEFAULT_OPTIONS, userOpts);

    // Collect elements
    _elements = [].slice.call(
      document.querySelectorAll(_options.selector)
    );

    // Inject default styles
    injectStyles(
      _options.theme,
      _options.fontFamily,
      _options.fontSize,
      _options.fontWeight
    );

    // Initial sync then start rendering
    syncTime().then(function () {
      if (!_rafId) {
        _rafId = requestAnimationFrame(renderTick);
      }
    });

    // Also start rendering immediately with unsynchronized time
    if (!_rafId) {
      _rafId = requestAnimationFrame(renderTick);
    }

    // Schedule periodic re-sync
    if (_syncTimerId) clearInterval(_syncTimerId);
    _syncTimerId = setInterval(syncTime, _options.syncInterval);
  }

  function destroy() {
    if (_rafId) {
      cancelAnimationFrame(_rafId);
      _rafId = null;
    }
    if (_syncTimerId) {
      clearInterval(_syncTimerId);
      _syncTimerId = null;
    }
    _elements = [];
    _synced = false;
    _offset = 0;
  }

  return {
    version: VERSION,
    init: init,
    destroy: destroy,
    sync: syncTime,
    now: preciseNow,
    date: preciseDate,
    getSyncInfo: function () {
      return _lastSyncInfo;
    },
    isSynced: function () {
      return _synced;
    },
  };
});
