import type postgres from "postgres";

export async function tableExists(
  sql: postgres.Sql,
  schema: string,
  table: string
): Promise<boolean> {
  const rows = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = ${schema}
        AND table_name = ${table}
    ) AS exists
  `;
  return rows[0]?.exists === true;
}

export async function probeDatabaseState(sql: postgres.Sql): Promise<{
  hasLostItems: boolean;
  hasSystemConfig: boolean;
}> {
  const [hasLostItems, hasSystemConfig] = await Promise.all([
    tableExists(sql, "public", "lost_items"),
    tableExists(sql, "public", "system_config"),
  ]);
  return { hasLostItems, hasSystemConfig };
}

export function isUndefinedTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: string; message?: string };
  const code = record.code ?? "";
  const message = (record.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("could not find the table")
  );
}
