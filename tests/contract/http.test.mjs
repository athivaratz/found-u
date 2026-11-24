import assert from "node:assert/strict";
import { test } from "node:test";
import { handlers } from "./catalog.mjs";

const base = process.env.BASE_URL?.replace(/\/+$/, "") || "";

function urlFor(path) {
  return `${base}${path.replace(":id", "00000000-0000-0000-0000-000000000000").replace(":discordUserId", "100000000000000000").replace(":sessionId", "00000000-0000-0000-0000-000000000000")}`;
}

test("HTTP contract against BASE_URL", async (t) => {
  if (!base) {
    t.skip("BASE_URL is not set. This environment has no Supabase, and middleware redirects the app to /setup, so the live API was not called.");
    return;
  }

  let reachable = false;
  try {
    const probe = await fetch(base, { redirect: "manual" });
    reachable = true;
    if (probe.status >= 300 && probe.status < 400) {
      const location = probe.headers.get("location") || "";
      if (location.includes("/setup")) {
        t.skip("BASE_URL redirects to /setup. That is the wizard guard, not the API contract.");
        return;
      }
    }
  } catch {
    reachable = false;
  }
  if (!reachable) {
    t.skip(`BASE_URL ${base} did not accept a connection.`);
    return;
  }

  const dbReady = process.env.CONTRACT_DB === "1";

  for (const row of handlers) {
    await t.test(`${row.method} ${row.path}`, async (st) => {
      if (row.probe == null) {
        st.skip(
          dbReady
            ? "status depends on stored rows; no fixture in this scaffold"
            : "needs Supabase (CONTRACT_DB is not set)"
        );
        return;
      }
      const init = { method: row.method, redirect: "manual", headers: {} };
      if (row.method !== "GET" && row.method !== "DELETE") {
        init.headers["content-type"] = "application/json";
        init.body = "{}";
      }
      const response = await fetch(urlFor(row.path), init);
      assert.equal(
        response.status,
        row.probe,
        `${row.method} ${row.path} returned ${response.status}, expected ${row.probe} with no credentials`
      );
    });
  }
});
