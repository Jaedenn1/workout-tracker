import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { getSql } from "../../../src/lib/neon";

export const runtime = "nodejs";

type SyncRow = {
  payload: unknown;
  updated_at: string | Date;
};

function getSyncKey(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const key = header.slice(7).trim();
  return key.length >= 24 ? key : null;
}

function hashSyncKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

async function ensureSchema(sql: NonNullable<ReturnType<typeof getSql>>) {
  await sql`
    CREATE TABLE IF NOT EXISTS workout_sync (
      sync_key_hash TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

export async function GET(request: Request) {
  const sql = getSql();
  if (!sql) {
    return NextResponse.json(
      { configured: false, message: "Cloud database is not configured yet." },
      { status: 503 },
    );
  }

  const key = getSyncKey(request);
  if (!key) {
    return NextResponse.json({ message: "Missing or invalid sync key." }, { status: 401 });
  }

  await ensureSchema(sql);
  const result = await sql`
    SELECT payload, updated_at
    FROM workout_sync
    WHERE sync_key_hash = ${hashSyncKey(key)}
    LIMIT 1
  `;
  const rows = result as unknown as SyncRow[];

  if (rows.length === 0) {
    return NextResponse.json({ configured: true, found: false });
  }

  return NextResponse.json({
    configured: true,
    found: true,
    payload: rows[0].payload,
    updatedAt: rows[0].updated_at,
  });
}

export async function PUT(request: Request) {
  const sql = getSql();
  if (!sql) {
    return NextResponse.json(
      { configured: false, message: "Cloud database is not configured yet." },
      { status: 503 },
    );
  }

  const key = getSyncKey(request);
  if (!key) {
    return NextResponse.json({ message: "Missing or invalid sync key." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON payload." }, { status: 400 });
  }

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ message: "Invalid sync payload." }, { status: 400 });
  }

  const serialized = JSON.stringify(payload);
  if (serialized.length > 1_500_000) {
    return NextResponse.json({ message: "Sync payload is too large." }, { status: 413 });
  }

  await ensureSchema(sql);
  const keyHash = hashSyncKey(key);

  await sql`
    INSERT INTO workout_sync (sync_key_hash, payload, updated_at)
    VALUES (${keyHash}, ${serialized}::jsonb, NOW())
    ON CONFLICT (sync_key_hash)
    DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
  `;

  return NextResponse.json({ configured: true, saved: true, updatedAt: new Date().toISOString() });
}
