export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { ensureDatabaseReady } = await import("@/lib/setup/ensure-database-ready");
  const state = await ensureDatabaseReady();

  if (!state.ready && state.reason !== "build_skip") {
    console.warn("[setup] ensureDatabaseReady:", state);
  }
}
