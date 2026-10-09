import test from "node:test";
import assert from "node:assert/strict";
import {
  connectCloud,
  cloudToken,
  disconnect,
  pickGame,
} from "../app/drive.js";
test("cloud consent validates scope and bound account; reconnect never silently switches accounts", async () => {
  const originalFetch = globalThis.fetch,
    originalWindow = globalThis.window,
    originalGoogle = globalThis.google;
  let account = "personal-account",
    denied = false;
  const fakeGoogle = {
    accounts: {
      oauth2: {
        initTokenClient(options) {
          return {
            requestAccessToken() {
              queueMicrotask(() =>
                options.callback({
                  access_token: "test-session-token",
                  expires_in: 3600,
                  scope: denied
                    ? "https://www.googleapis.com/auth/drive.file"
                    : options.scope,
                }),
              );
            },
          };
        },
        revoke() {},
      },
    },
  };
  globalThis.window = { google: fakeGoogle };
  globalThis.google = fakeGoogle;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ user: { permissionId: account } }), {
      status: 200,
    });
  const config = {
    clientId: "example.apps.googleusercontent.com",
    apiKey: "picker-key",
    project: "123",
  };
  try {
    await connectCloud(config, "personal-account");
    assert.equal(cloudToken(), "test-session-token");
    account = "other-account";
    await assert.rejects(() => connectCloud(config, "personal-account"));
    assert.throws(() => cloudToken());
    disconnect();
    assert.throws(() => cloudToken());
    denied = true;
    account = "personal-account";
    await assert.rejects(() => connectCloud(config, "personal-account"));
    assert.throws(() => cloudToken());
  } finally {
    disconnect();
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
    globalThis.google = originalGoogle;
  }
});
