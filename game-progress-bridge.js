/**
 * 游戏进度 Bridge。只保留 callHost 与 sandbox 回包。
 * 不要 request、track、激励视频。
 */
(function (global) {
  "use strict";

  var sandboxWaiters = {};
  var messageHooked = false;
  var SANDBOX_CHANNEL = "hoorah-minigame-sandbox";
  var hostWindow = null;

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
    if (hostWindow && event.source !== hostWindow) return;
    if (data.type !== "call-result" || !data.requestId) return;
    var waiter = sandboxWaiters[data.requestId];
    if (!waiter) return;
    delete sandboxWaiters[data.requestId];
    if (waiter.timer) {
      try { clearTimeout(waiter.timer); } catch (_) {}
    }
    waiter.resolve(data);
  }

  function installMessageHook() {
    if (messageHooked) return;
    messageHooked = true;
    try { global.addEventListener("message", onWindowMessage); } catch (_) {}
  }

  function nextRequestId() {
    return Date.now() + "_" + Math.random().toString(36).slice(2, 10);
  }

  function callHost(method, payload, timeoutMs) {
    installMessageHook();
    hostWindow = global.parent && global.parent !== global
      ? global.parent
      : null;
    if (!hostWindow || typeof hostWindow.postMessage !== "function") {
      return Promise.reject(new Error("进度宿主不可用"));
    }
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
        hostWindow.postMessage({
          channel: SANDBOX_CHANNEL,
          type: "call",
          method: method,
          requestId: id,
          payload: payload || {},
        }, "*");
      } catch (err) {
        delete sandboxWaiters[id];
        reject(err);
      }
    });
  }

  var api = global.__HOORAH_LAMPS_BRIDGE__ || {};
  if (typeof api.callHost !== "function") api.callHost = callHost;
  global.__HOORAH_LAMPS_BRIDGE__ = api;
})(typeof window !== "undefined" ? window : globalThis);
