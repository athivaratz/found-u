import postgres from "postgres";
import { SETUP_ADVISORY_LOCK_ID } from "@/lib/setup/constants";
import { resolvePostgresUrl } from "@/lib/setup/db-url";
import { probeDatabaseState } from "@/lib/setup/probe";
import {
  loadAllMigrationSql,
  loadSystemConfigMigrationSql,
} from "@/lib/setup/schemas";

export type HydrationResult = {
  ok: boolean;
  reason?: "missing_env" | "no_migrations" | "hydration_failed";
  error?: string;
  mode?: "full" | "system_config_only" | "skipped";
};

async function runSqlBatch(sql: postgres.Sql, batchSql: string): Promise<void> {
  await sql.unsafe(batchSql);
}

export async function hydrateDatabase(): Promise<HydrationResult> {
  const connectionString = resolvePostgresUrl();
  if (!connectionString) {
    return { ok: false, reason: "missing_env" };
  }

  const sql = postgres(connectionString, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 15,
    prepare: false,
  });

  try {
    await sql`SELECT pg_advisory_lock(${SETUP_ADVISORY_LOCK_ID})`;

    const state = await probeDatabaseState(sql);

    if (state.hasSystemConfig && state.hasLostItems) {
      await backfillSetupStatusIfNeeded(sql);
      return { ok: true, mode: "skipped" };
    }

    if (state.hasLostItems && !state.hasSystemConfig) {
      const systemConfigSql = loadSystemConfigMigrationSql();
      if (!systemConfigSql) {
        return { ok: false, reason: "no_migrations" };
      }
      await runSqlBatch(sql, systemConfigSql);
      await backfillSetupStatusIfNeeded(sql);
      return { ok: true, mode: "system_config_only" };
    }

    const migrations = loadAllMigrationSql();
    if (migrations.length === 0) {
      return { ok: false, reason: "no_migrations" };
    }

    for (const migration of migrations) {
      await runSqlBatch(sql, migration.sql);
    }

    return { ok: true, mode: "full" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[setup] hydration failed:", message);
    return { ok: false, reason: "hydration_failed", error: message };
  } finally {
    try {
      await sql`SELECT pg_advisory_unlock(${SETUP_ADVISORY_LOCK_ID})`;
    } catch {
      // ignore unlock errors
    }
    await sql.end({ timeout: 5 });
  }
}

async function backfillSetupStatusIfNeeded(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(`
    INSERT INTO public.system_config (id, config_data)
    SELECT
      'setup_status',
      jsonb_build_object('is_completed', true, 'current_step', 3, 'backfilled_at', now())
    FROM public.app_settings
    WHERE id = 'default'
    ON CONFLICT (id) DO UPDATE
    SET
      config_data = jsonb_build_object('is_completed', true, 'current_step', 3, 'backfilled_at', now()),
      updated_at = now()
    WHERE EXISTS (SELECT 1 FROM public.app_settings WHERE id = 'default')
      AND (public.system_config.config_data->>'is_completed')::boolean IS DISTINCT FROM true;
  `);
}
