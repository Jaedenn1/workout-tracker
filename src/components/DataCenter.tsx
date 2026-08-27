"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import {
  createSafetySnapshot,
  exportBackup,
  exportWorkoutCsv,
  getDatabaseStats,
  listSafetySnapshots,
  restoreBackup,
  restoreSafetySnapshot,
  validateBackup,
  type BackupRow,
} from "../lib/database";

type Stats = Awaited<ReturnType<typeof getDatabaseStats>>;

function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function timestampName() {
  return new Date().toISOString().replaceAll(":", "-").replace("T", "-").slice(0, 19);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function DataCenter() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [snapshots, setSnapshots] = useState<BackupRow[]>([]);
  const [status, setStatus] = useState("IndexedDB is the durable local store in v1.0.");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setStats(await getDatabaseStats());
    setSnapshots(await listSafetySnapshots());
  }

  useEffect(() => {
    void refresh().catch(() => setStatus("Could not read IndexedDB. The legacy local fallback may still be active."));
  }, []);

  async function exportJson() {
    setBusy(true);
    try {
      const backup = await exportBackup();
      downloadText(
        `workout-tracker-backup-${timestampName()}.json`,
        JSON.stringify(backup, null, 2),
        "application/json",
      );
      setStatus("Full local backup exported. Keep this file somewhere you control.");
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    setBusy(true);
    try {
      const csv = await exportWorkoutCsv();
      downloadText(`workout-history-${timestampName()}.csv`, csv, "text/csv;charset=utf-8");
      setStatus("Workout history CSV exported.");
    } finally {
      setBusy(false);
    }
  }

  async function snapshot() {
    setBusy(true);
    try {
      await createSafetySnapshot("Manual v1.0 safety snapshot");
      await refresh();
      setStatus("Safety snapshot created inside IndexedDB.");
    } finally {
      setBusy(false);
    }
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setBusy(true);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!validateBackup(parsed)) throw new Error("That file is not a Workout Tracker v1.0 backup.");
      if (!window.confirm("Restore this backup and replace the current local workout data on this device?")) return;

      await createSafetySnapshot("Automatic snapshot before file restore");
      await restoreBackup(parsed);
      setStatus("Backup restored. Reloading Workout Tracker…");
      window.location.reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not restore that backup.");
    } finally {
      setBusy(false);
    }
  }

  async function restoreSnapshot(id: string) {
    if (!window.confirm("Restore this safety snapshot and replace current local data?")) return;
    setBusy(true);
    try {
      await createSafetySnapshot("Automatic snapshot before safety restore");
      await restoreSafetySnapshot(id);
      setStatus("Safety snapshot restored. Reloading…");
      window.location.reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not restore that snapshot.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="v10-shell">
      <header className="v10-hero">
        <div>
          <p className="v10-eyebrow">V1.0 · DATA SAFETY</p>
          <h1>Data Center</h1>
          <p>IndexedDB now mirrors and normalizes your workout data, while the legacy keys remain for compatibility with every earlier Workout Tracker release.</p>
        </div>
        <a className="v10-back" href="/gym">← Gym Mode</a>
      </header>

      <div className="v10-status" role="status">{status}</div>

      <section className="v10-kpis">
        <div><span>Workouts</span><strong>{stats?.workouts ?? "—"}</strong></div>
        <div><span>Routines</span><strong>{stats?.routines ?? "—"}</strong></div>
        <div><span>Bodyweight</span><strong>{stats?.bodyweight ?? "—"}</strong></div>
        <div><span>Safety backups</span><strong>{stats?.backups ?? "—"}</strong></div>
        <div><span>Queued changes</span><strong>{stats?.queuedChanges ?? "—"}</strong></div>
      </section>

      <section className="v10-grid">
        <article className="v10-card">
          <p className="v10-eyebrow">PORTABLE BACKUP</p>
          <h2>Own your workout data</h2>
          <p>Export a versioned JSON backup for full restore, or a flat CSV when you want your lifting history in a spreadsheet.</p>
          <div className="v10-actions">
            <button type="button" disabled={busy} onClick={exportJson}>Export full JSON</button>
            <button type="button" disabled={busy} onClick={exportCsv}>Export workout CSV</button>
          </div>
        </article>

        <article className="v10-card">
          <p className="v10-eyebrow">RESTORE</p>
          <h2>Recover without guessing</h2>
          <p>Before a restore, v1.0 automatically creates another local safety snapshot so you have a way back.</p>
          <label className="v10-file-button" htmlFor="v10-backup-file">Choose backup JSON</label>
          <input id="v10-backup-file" className="v10-file" type="file" accept="application/json,.json" onChange={importBackup} />
        </article>

        <article className="v10-card">
          <p className="v10-eyebrow">LOCAL SNAPSHOT</p>
          <h2>Checkpoint before changes</h2>
          <p>Create an IndexedDB-only checkpoint before editing history, testing sync, or changing routines.</p>
          <button type="button" disabled={busy} onClick={snapshot}>Create safety snapshot</button>
        </article>
      </section>

      <section className="v10-card v10-wide">
        <div className="v10-section-heading">
          <div>
            <p className="v10-eyebrow">RECENT SAFETY SNAPSHOTS</p>
            <h2>Rollback points</h2>
          </div>
          <a href="/history">Open workout history →</a>
        </div>

        {snapshots.length ? (
          <div className="v10-snapshot-list">
            {snapshots.map((item) => (
              <div key={item.id} className="v10-snapshot-row">
                <div>
                  <strong>{item.label}</strong>
                  <span>{formatDate(item.createdAt)}</span>
                </div>
                <button type="button" disabled={busy} onClick={() => restoreSnapshot(item.id)}>Restore</button>
              </div>
            ))}
          </div>
        ) : (
          <p className="v10-muted">No safety snapshots yet. Create one before your next major routine edit.</p>
        )}
      </section>

      <section className="v10-card v10-wide">
        <p className="v10-eyebrow">V1.0 STORAGE MODEL</p>
        <h2>Local-first, with a compatibility mirror</h2>
        <div className="v10-model">
          <div><strong>1</strong><span>Gym Mode writes normally.</span></div>
          <div><strong>2</strong><span>Writes are mirrored into IndexedDB and normalized tables.</span></div>
          <div><strong>3</strong><span>A compact sync queue records the newest unsent state per data key.</span></div>
          <div><strong>4</strong><span>Cloud failure never blocks the local workout.</span></div>
        </div>
      </section>
    </main>
  );
}
