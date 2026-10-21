/**
 * 激励视频 Bridge。只保留 lamps.ad.showRewardedVideo 与状态回调。
 * 结果只认 lamps.ad.rewardedVideoStatus，不要等 invoke 回包。
 */
(function (global) {
  "use strict";

  var METHOD_AD = "lamps.ad.showRewardedVideo";
  var STATUS_EVENT = "lamps.ad.rewardedVideoStatus";
  var LEGACY_STATUS_EVENT = "hoorah.ad.rewardedVideoStatus";

  var ERR_MESSAGES = {
    2001: "广告能力未就绪",
    2002: "广告能力不可用",
    2003: "暂无可用广告",
    2004: "暂无可用广告",
    2005: "广告进行中",
    2006: "广告位非法",
    2007: "获取广告失败",
    2008: "广告加载超时",
    2009: "广告加载失败",
  };

  var hostListeners = {};
  var currentSettle = null;
  var ourHandle = null;
  var ourReceive = null;
  var prevHandle = null;
  var prevHupuHandle = null;
  var prevReceive = null;
  var hookTimer = null;
  var messageHooked = false;
  var ingestingFromHost = false;
  var forwarding = false;
  var SANDBOX_CHANNEL = "hoorah-minigame-sandbox";

  function hasNativeBridge() {
    try {
      if (global.webkit && global.webkit.messageHandlers && global.webkit.messageHandlers.chatMessage) {
        return true;
      }
    } catch (_) {}
    try {
      return !!(global.androidBridge && typeof global.androidBridge.postMessage === "function");
    } catch (_) {
      return false;
    }
  }

  function postToNative(payload) {
    var ios = global.webkit && global.webkit.messageHandlers && global.webkit.messageHandlers.chatMessage;
    if (ios) {
      ios.postMessage(payload);
      return;
    }
    if (global.androidBridge && typeof global.androidBridge.postMessage === "function") {
      global.androidBridge.postMessage(payload);
      return;
    }
    throw new Error("Bridge not available");
  }

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

  function dispatchHostEvent(eventName, payload) {
    var set = hostListeners[eventName];
    if (!set) return;
    for (var i = 0; i < set.length; i++) {
      try {
        set[i](payload);
      } catch (_) {}
    }
  }

  function isStatusEvent(name) {
    return (
      name === STATUS_EVENT ||
      name === LEGACY_STATUS_EVENT ||
      name === "rewardedVideoStatus"
    );
  }

  function isOwnHandle(fn) {
    if (!fn || typeof fn !== "function") return true;
    if (fn === ourHandle || fn === ourReceive) return true;
    if (fn.name === "onNativeHandle") return true;
    return false;
  }

  function ingestStatusPayload(payload) {
    dispatchHostEvent(STATUS_EVENT, payload);
  }

  function ingestNativeEnvelope(raw) {
    var msg = asObject(raw);
    if (!msg) return;

    var method = msg.method || msg.event || msg.eventName || "";
    if (isStatusEvent(method)) {
      ingestStatusPayload(msg.params != null ? msg.params : msg.data != null ? msg.data : msg);
      return;
    }
    if (msg.callbackName || (msg.params && msg.params.callbackName) || (msg.data && msg.data.callbackName)) {
      ingestStatusPayload(msg);
    }
  }

  function forwardToHost(eventName, payload) {
    if (ingestingFromHost || forwarding) return;
    forwarding = true;
    try {
      if (typeof prevHandle === "function" && !isOwnHandle(prevHandle)) {
        prevHandle(eventName, payload);
      }
      if (
        typeof prevHupuHandle === "function" &&
        !isOwnHandle(prevHupuHandle) &&
        prevHupuHandle !== prevHandle
      ) {
        prevHupuHandle(eventName, payload);
      }
    } catch (_) {
    } finally {
      forwarding = false;
    }
  }

  function onNativeHandle(eventName, payload) {
    if (eventName && typeof eventName === "object") {
      ingestNativeEnvelope(eventName);
    } else if (isStatusEvent(eventName)) {
      ingestStatusPayload(payload);
    } else {
      ingestNativeEnvelope({ method: eventName, params: payload });
    }
    forwardToHost(eventName, payload);
  }

  function attachHandle(win, name) {
    if (!win) return;
    var bridge = win[name];
    if (!bridge || typeof bridge !== "object") {
      bridge = {};
      try {
        win[name] = bridge;
      } catch (_) {
        return;
      }
    }
    if (bridge._handle_ && bridge._handle_ !== ourHandle && typeof bridge._handle_ === "function") {
      if (!isOwnHandle(bridge._handle_)) {
        if (name === "HoorahBridge") prevHandle = bridge._handle_;
        if (name === "HupuBridge") prevHupuHandle = bridge._handle_;
      }
    }
    if (bridge._handle_ !== ourHandle) {
      try {
        bridge._handle_ = ourHandle;
      } catch (_) {}
    }
  }

  function installOnWindow(win) {
    if (!win) return;
    attachHandle(win, "HoorahBridge");
    attachHandle(win, "HupuBridge");
    try {
      win.__HOORAH_NATIVE_HANDLE__ = ourHandle;
    } catch (_) {}
    if (win.receiveNativeMessage !== ourReceive) {
      if (typeof win.receiveNativeMessage === "function" && win.receiveNativeMessage !== ourReceive) {
        if (!isOwnHandle(win.receiveNativeMessage)) {
          prevReceive = win.receiveNativeMessage;
        }
      }
      try {
        win.receiveNativeMessage = ourReceive;
      } catch (_) {}
    }
  }

  function onWindowMessage(event) {
    var data = event && event.data;
    if (typeof data === "string") {
      data = asObject(data);
    }
    if (!data || typeof data !== "object") return;
    if (data.channel !== SANDBOX_CHANNEL) return;
    if (data.type !== "native-bridge") return;
    ingestingFromHost = true;
    try {
      onNativeHandle(data.eventName, data.payload);
    } finally {
      ingestingFromHost = false;
    }
  }

  function installMessageHook() {
    if (messageHooked) return;
    messageHooked = true;
    try {
      global.addEventListener("message", onWindowMessage);
    } catch (_) {}
  }

  function installBridgeHooks() {
    if (!ourHandle) ourHandle = onNativeHandle;
    if (!ourReceive) {
      ourReceive = function (raw) {
        ingestNativeEnvelope(raw);
        if (typeof prevReceive === "function" && prevReceive !== ourReceive && !isOwnHandle(prevReceive)) {
          try {
            prevReceive(raw);
          } catch (_) {}
        }
      };
    }
    installOnWindow(global);
    installMessageHook();
    try {
      if (global.parent && global.parent !== global) installOnWindow(global.parent);
    } catch (_) {}
    try {
      if (global.top && global.top !== global) installOnWindow(global.top);
    } catch (_) {}
  }

  function startHookWatch() {
    installBridgeHooks();
    if (hookTimer) return;
    hookTimer = global.setInterval(function () {
      installBridgeHooks();
    }, 400);
  }

  function on(eventName, handler) {
    startHookWatch();
    if (!hostListeners[eventName]) hostListeners[eventName] = [];
    hostListeners[eventName].push(handler);
    return function () {
      var list = hostListeners[eventName];
      if (!list) return;
      for (var i = list.length - 1; i >= 0; i--) {
        if (list[i] === handler) list.splice(i, 1);
      }
    };
  }

  function invokeImmediate(method, data) {
    startHookWatch();
    if (!hasNativeBridge()) {
      throw new Error("Bridge not available");
    }
    var id = Date.now() + "_" + Math.random().toString(36).slice(2, 9);
    postToNative(
      JSON.stringify({
        type: "request",
        id: id,
        method: method,
        data: data || {},
        callbackSig: id,
      })
    );
  }

  function parsePayload(raw) {
    var payload = asObject(raw);
    if (!payload) return {};

    var nested = null;
    if (payload.params != null) nested = asObject(payload.params) || payload.params;
    if (!nested && payload.data != null) nested = asObject(payload.data) || payload.data;
    if (!nested && payload.payload != null) nested = asObject(payload.payload) || payload.payload;
    if (!nested || typeof nested !== "object") nested = {};

    var callbackName = payload.callbackName || nested.callbackName || "";
    var errCode = nested.errCode != null ? nested.errCode : payload.errCode;
    var errMsg =
      nested.errMsg ||
      nested.errMessage ||
      payload.errMsg ||
      payload.message ||
      "";
    var rewardStatus = payload.rewardStatus;
    if (rewardStatus == null) rewardStatus = nested.rewardStatus;

    return {
      callbackName: String(callbackName || ""),
      errCode: errCode,
      errMsg: String(errMsg || ""),
      rewardStatus: rewardStatus,
    };
  }

  function messageForCode(code, fallback) {
    var key = code == null ? "" : String(code);
    var numeric = Number(key);
    if (ERR_MESSAGES[numeric]) return ERR_MESSAGES[numeric];
    if (fallback) return fallback;
    return "观看视频失败，请重试";
  }

  function failResult(code, message) {
    return {
      ok: false,
      code: code == null ? "REWARD_FLOW_FAILED" : String(code),
      message: messageForCode(code, message),
    };
  }

  function isRewardedStatus(value) {
    if (value === true || value === 1) return true;
    if (typeof value !== "string") return false;
    var normalized = value.trim().toLowerCase();
    return (
      normalized === "true" ||
      normalized === "1" ||
      normalized === "rewarded" ||
      normalized === "completed" ||
      normalized === "success"
    );
  }

  function isPending() {
    return currentSettle != null;
  }

  function showRewardedVideo(options) {
    options = options || {};
    var forwardSource = options.forward_source || options.forwardSource || "";

    if (currentSettle) {
      return Promise.resolve(failResult(2005));
    }

    if (!hasNativeBridge()) {
      return Promise.resolve(failResult("APP_REQUIRED", "请在 App 内观看广告"));
    }

    startHookWatch();

    return new Promise(function (resolve) {
      var settled = false;
      var off = function () {};

      function settle(result) {
        if (settled) return;
        settled = true;
        currentSettle = null;
        off();
        resolve(result);
      }

      currentSettle = settle;
      off = on(STATUS_EVENT, function (payload) {
        var ev = parsePayload(payload);
        var name = ev.callbackName;

        if (name === "onBusy") {
          settle(failResult(2005));
          return;
        }
        if (name === "onRewardArrived") {
          settle({ ok: true });
          return;
        }
        if (name === "onLoadError" || name === "onShowError") {
          settle(failResult(ev.errCode != null ? ev.errCode : "REWARD_FLOW_FAILED", ev.errMsg));
          return;
        }
        if (name === "onClose") {
          if (isRewardedStatus(ev.rewardStatus)) {
            settle({ ok: true });
            return;
          }
          settle(failResult("NOT_REWARDED", "需看完视频才能获得奖励"));
        }
      });

      try {
        var invokeData = {};
        if (forwardSource) invokeData.forward_source = forwardSource;
        invokeImmediate(METHOD_AD, invokeData);
      } catch (err) {
        settle(
          failResult("UNAVAILABLE", err && err.message ? err.message : "广告调用失败")
        );
      }
    });
  }

  startHookWatch();

  var api = {
    isAvailable: hasNativeBridge,
    isPending: isPending,
    showRewardedVideo: showRewardedVideo,
  };

  global.__HOORAH_LAMPS_BRIDGE__ = api;
  global.__HOORAH_LAMPS_REWARD_AD__ = api;
})(typeof window !== "undefined" ? window : globalThis);
