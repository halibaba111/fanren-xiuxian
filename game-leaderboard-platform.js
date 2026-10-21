/**
 * 游戏榜单入口。
 * 游戏逻辑只调用 window.LampsPlatform 上的三个榜单方法。
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

  function hasLampsSdkUa() {
    try {
      return (
        String((global.navigator && global.navigator.userAgent) || "").indexOf(
          "LampsSDK"
        ) !== -1
      );
    } catch (_) {
      return false;
    }
  }

  function callHost(method, payload) {
    var b = bridge();
    if (!b || typeof b.callHost !== "function") {
      return Promise.resolve({
        ok: false,
        message: "榜单能力暂不可用",
        data: null,
      });
    }
    return b.callHost(method, payload || {}).then(normalizeHostResult).catch(function (err) {
      return {
        ok: false,
        message: err && err.message ? err.message : String(err),
        data: null,
      };
    });
  }

  function toLeaderboardScore(score) {
    if (typeof score === "number" && isFinite(score)) return Math.trunc(score);
    if (typeof score === "string" && String(score).trim()) {
      var parsed = Number(score);
      if (isFinite(parsed)) return Math.trunc(parsed);
    }
    return null;
  }

  function submitLeaderboardScore(score) {
    if (!hasLampsSdkUa()) {
      return Promise.resolve({
        ok: false,
        message: "排行榜暂不可用",
        data: null,
      });
    }
    var normalized = toLeaderboardScore(score);
    if (normalized == null) {
      return Promise.resolve({
        ok: false,
        message: "得分必须是整数",
        data: null,
      });
    }
    return callHost("submitLeaderboardScore", { score: normalized });
  }

  function getLeaderboard() {
    if (!hasLampsSdkUa()) {
      return Promise.resolve({
        ok: true,
        data: { list: [] },
      });
    }
    return callHost("getLeaderboard", {});
  }

  function getMyLeaderboardRecord() {
    if (!hasLampsSdkUa()) {
      return Promise.resolve({
        ok: true,
        data: { record: null },
      });
    }
    return callHost("getMyLeaderboardRecord", {});
  }

  var api = global.LampsPlatform || {};
  api.submitLeaderboardScore = submitLeaderboardScore;
  api.getLeaderboard = getLeaderboard;
  api.getMyLeaderboardRecord = getMyLeaderboardRecord;
  if (!api.bridge) api.bridge = bridge;
  global.LampsPlatform = api;
})(typeof window !== "undefined" ? window : globalThis);
