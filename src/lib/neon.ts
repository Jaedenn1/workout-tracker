import { neon } from "@neondatabase/serverless";

type NeonSql = ReturnType<typeof neon>;

let sqlClient: NeonSql | null = null;

export function getSql(): NeonSql | null {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return null;

  if (!sqlClient) {
    sqlClient = neon(databaseUrl);
  }

  return sqlClient;
}
