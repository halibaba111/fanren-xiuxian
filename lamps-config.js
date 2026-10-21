/**
 * Lamps runtime configuration.
 * The workSessionId is the published work id returned by the Lamps platform.
 * auth_key is intentionally not part of the client bundle.
 */
(function (global) {
  "use strict";

  global.LAMPS_CONFIG = global.LAMPS_CONFIG || {
    gameId: "",
    workSessionId: "4e5bb0bc-7a35-41a0-91cb-6306607be90f",
  };
  if (global.LAMPS_CONFIG.workSessionId == null) {
    global.LAMPS_CONFIG.workSessionId = "4e5bb0bc-7a35-41a0-91cb-6306607be90f";
  }
  global.__LAMPS_GAME_ID__ = global.__LAMPS_GAME_ID__ || "";
})(typeof window !== "undefined" ? window : globalThis);
