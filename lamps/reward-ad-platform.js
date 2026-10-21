/**
 * 激励视频的游戏入口。只暴露 showRewardedVideo 及 forward_source 所需的 id。
 * 底层走 window.__HOORAH_LAMPS_BRIDGE__。游戏代码只调 window.LampsPlatform。
 */
(function (global) {
  "use strict";

  var sessionId = null;

  function bridge() {
    return global.__HOORAH_LAMPS_BRIDGE__;
  }

  function absorbQuery(bag, raw) {
    if (!raw) return;
    try {
      var text = String(raw);
      if (text.charAt(0) === "?") text = text.slice(1);
      if (!text) return;
      var params = new URLSearchParams(text);
      params.forEach(function (value, key) {
        if (bag[key] == null || String(bag[key]).trim() === "") {
          bag[key] = value;
        }
      });
    } catch (e) {}
  }

  function readQueryBag() {
    var bag = {};
    try {
      absorbQuery(bag, global.location && global.location.search);
    } catch (e) {}
    try {
      var hash = String((global.location && global.location.hash) || "");
      var qIndex = hash.indexOf("?");
      if (qIndex >= 0) absorbQuery(bag, hash.slice(qIndex));
    } catch (e) {}
    return bag;
  }

  function qs(name) {
    var bag = readQueryBag();
    return Object.prototype.hasOwnProperty.call(bag, name) ? bag[name] : null;
  }

  function nonempty(value) {
    if (value == null) return "";
    return String(value).trim();
  }

  function firstNonempty(values) {
    for (var i = 0; i < values.length; i++) {
      var text = nonempty(values[i]);
      if (text) return text;
    }
    return "";
  }

  /** forward_source 第一段：workSessionId 或 gameId，均为字符串，不校验数字 */
  function getPublishedGameId() {
    var config = global.LAMPS_CONFIG || {};
    var workSessionId = firstNonempty([
      qs("workSessionId"),
      qs("worksSessionId"),
      config.workSessionId,
    ]);
    if (workSessionId) return workSessionId;
    return firstNonempty([
      qs("gameId"),
      qs("miniGameId"),
      qs("mini_game_id"),
      config.gameId,
      global.__LAMPS_GAME_ID__,
    ]);
  }

  function hasPublishedGameId() {
    return !!getPublishedGameId();
  }

  function getSessionId() {
    if (sessionId) return sessionId;
    sessionId = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx".replace(/x/g, function () {
      return Math.floor(Math.random() * 16).toString(16);
    });
    return sessionId;
  }

  function getForwardSource(source) {
    var sourceId = getPublishedGameId();
    if (!sourceId) return "";
    var pre = source || "None";
    return sourceId + ":" + getSessionId() + ":" + pre;
  }

  function isAvailable() {
    var b = bridge();
    return !!(b && typeof b.isAvailable === "function" && b.isAvailable());
  }

  function isPending() {
    var b = bridge();
    return !!(b && typeof b.isPending === "function" && b.isPending());
  }

  function showRewardedVideo(options) {
    options = options || {};
    if (!hasPublishedGameId()) {
      return Promise.resolve({
        ok: false,
        code: "GAME_ID_REQUIRED",
        message: "缺少 gameId 或 workSessionId，无法播放广告",
      });
    }
    var b = bridge();
    if (!b || typeof b.showRewardedVideo !== "function") {
      return Promise.resolve({
        ok: false,
        code: "UNAVAILABLE",
        message: "广告暂不可用",
      });
    }
    var forward =
      options.forward_source ||
      options.forwardSource ||
      getForwardSource(options.source);
    if (!forward) {
      return Promise.resolve({
        ok: false,
        code: "GAME_ID_REQUIRED",
        message: "缺少 gameId 或 workSessionId，无法播放广告",
      });
    }
    return b.showRewardedVideo({ forward_source: forward });
  }

  global.LampsPlatform = {
    getGameId: getPublishedGameId,
    getPublishedGameId: getPublishedGameId,
    hasPublishedGameId: hasPublishedGameId,
    getSessionId: getSessionId,
    getForwardSource: getForwardSource,
    isAvailable: isAvailable,
    isPending: isPending,
    showRewardedVideo: showRewardedVideo,
    bridge: bridge,
  };
})(typeof window !== "undefined" ? window : globalThis);
