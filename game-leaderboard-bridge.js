/**
 * 游戏榜单 Bridge。
 * 只负责 callHost 和 sandbox 回包，不覆盖已有 Lamps bridge 能力。
 */
(function (global) {
  "use strict";

  var sandboxWaiters = {};
  var messageHooked = false;
  var SANDBOX_CHANNEL = "hoorah-minigame-sandbox";

  function asObject(raw) {
    if (raw == null) return null;
    if (typeof raw === "string") {
      var text = raw.trim();
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch (_) {
        return null;
      }
    }
    if (typeof raw === "object") return raw;
    return null;
  }

  function onWindowMessage(event) {
    var data = event && event.data;
    if (typeof data === "string") data = asObject(data);
    if (!data || typeof data !== "object") return;
    if (data.channel !== SANDBOX_CHANNEL) return;
    if (data.type !== "call-result" || !data.requestId || !sandboxWaiters[data.requestId]) {
      return;
    }
    var waiter = sandboxWaiters[data.requestId];
    delete sandboxWaiters[data.requestId];
    if (waiter.timer) {
      try {
        clearTimeout(waiter.timer);
      } catch (_) {}
    }
    waiter.resolve(data);
  }

  function installMessageHook() {
    if (messageHooked) return;
    messageHooked = true;
    try {
      global.addEventListener("message", onWindowMessage);
    } catch (_) {}
  }

  function nextRequestId() {
    return Date.now() + "_" + Math.random().toString(36).slice(2, 10);
  }

  function callHost(method, payload, timeoutMs) {
    installMessageHook();
    var id = nextRequestId();
    return new Promise(function (resolve, reject) {
      sandboxWaiters[id] = {
        resolve: resolve,
        reject: reject,
        timer: setTimeout(function () {
          if (!sandboxWaiters[id]) return;
          delete sandboxWaiters[id];
          reject(new Error("call timeout " + method));
        }, timeoutMs || 15000),
      };
      try {
        var target = global.parent && global.parent !== global ? global.parent : global;
        target.postMessage(
          {
            channel: SANDBOX_CHANNEL,
            type: "call",
            method: method,
            requestId: id,
            payload: payload || {},
          },
          "*"
        );
      } catch (err) {
        delete sandboxWaiters[id];
        reject(err);
      }
    });
  }

  var api = global.__HOORAH_LAMPS_BRIDGE__ || {};
  if (typeof api.callHost !== "function") {
    installMessageHook();
    api.callHost = callHost;
  }
  global.__HOORAH_LAMPS_BRIDGE__ = api;
})(typeof window !== "undefined" ? window : globalThis);
