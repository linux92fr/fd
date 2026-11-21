import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";

function request(path, options = {}) {
  return new Request("https://fd.focom-iliad.fr" + path, options);
}

test("GET /admin serves the SPA entry point", async () => {
  let requestedUrl = "";
  const env = {
    ASSETS: {
      async fetch(assetRequest) {
        requestedUrl = new URL(assetRequest.url).pathname;
        return new Response("<!doctype html><html><body>admin app</body></html>", {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      },
    },
  };

  const response = await worker.fetch(request("/admin"), env, {});
  assert.equal(response.status, 200);
  assert.equal(requestedUrl, "/index.html");
  assert.match(await response.text(), /admin app/);
});

test("GET /admin/ also serves the SPA entry point", async () => {
  let requestedUrl = "";
  const env = {
    ASSETS: {
      async fetch(assetRequest) {
        requestedUrl = new URL(assetRequest.url).pathname;
        return new Response("admin app");
      },
    },
  };

  const response = await worker.fetch(request("/admin/"), env, {});
  assert.equal(response.status, 200);
  assert.equal(requestedUrl, "/index.html");
});

test("protected public APIs reject requests without a site-access session", async () => {
  const response = await worker.fetch(request("/api/health"), {}, {});
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "SITE_ACCESS_REQUIRED" });
});

test("admin APIs reject requests without a Neon Auth bearer token", async () => {
  const response = await worker.fetch(request("/api/admin/maintenance"), {}, {});
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "TOKEN_MISSING" });
});

test("site access status is safely unauthenticated when signing is not configured", async () => {
  const response = await worker.fetch(request("/api/site-access/status"), {}, {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { authenticated: false });
});

test("the access page remains available without a site-access session", async () => {
  const response = await worker.fetch(request("/acces"), {}, {});
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Accès|accès/);
});
