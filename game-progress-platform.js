/**
 * 游戏进度的游戏入口。只暴露 saveGameProgress、getGameProgress。
 * 底层走 window.__HOORAH_LAMPS_BRIDGE__.callHost。
 */
(function (global) {
  "use strict";

  function bridge() {
    return global.__HOORAH_LAMPS_BRIDGE__;
  }

  function normalizeHostResult(msg) {
    if (!msg || msg.ok === false) {
      return {
        ok: false,
        message: (msg && msg.message) || "调用失败",
        data: null,
      };
    }
    return {
      ok: true,
      data: msg.data == null ? null : msg.data,
    };
  }

  function callHost(method, payload) {
    var b = bridge();
    if (!b || typeof b.callHost !== "function") {
      return Promise.resolve({
        ok: false,
        message: "进度能力暂不可用",
        data: null,
      });
    }
    return b.callHost(method, payload || {})
      .then(normalizeHostResult)
      .catch(function (err) {
        return {
          ok: false,
          message: err && err.message ? err.message : String(err),
          data: null,
        };
      });
  }

  function pickProgressPayload(progress) {
    if (progress == null) return {};
    if (typeof progress !== "object") return progress;
    if (
      Object.prototype.hasOwnProperty.call(progress, "game_payload") ||
      Object.prototype.hasOwnProperty.call(progress, "game_paload") ||
      Object.prototype.hasOwnProperty.call(progress, "payload")
    ) {
      return progress;
    }
    return { game_payload: progress };
  }

  var api = global.LampsPlatform || {};
  api.saveGameProgress = function (progress) {
    return callHost("saveGameProgress", pickProgressPayload(progress));
  };
  api.getGameProgress = function () {
    return callHost("getGameProgress", {});
  };
  if (!api.bridge) api.bridge = bridge;
  global.LampsPlatform = api;
})(typeof window !== "undefined" ? window : globalThis);
