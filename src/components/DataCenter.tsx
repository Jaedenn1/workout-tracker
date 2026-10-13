"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import {
  Button,
  Card,
  EmptyState,
  ListRow,
  PageHeader,
  PageShell,
  SectionHeader,
  Stat,
  StatGrid,
} from "../ui";
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

const STORAGE_MODEL = [
  "Gym Mode writes normally.",
  "Writes are mirrored into IndexedDB and normalized tables.",
  "A compact sync queue records the newest unsent state per data key.",
  "Cloud failure never blocks the local workout.",
];

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

  const go = (href: string) => { window.location.href = href; };

  return (
    <PageShell>
      <div className="ds-rise">
        <PageHeader
          eyebrow="V1.0 · Data safety"
          eyebrowVolt
          title={<>Data <span className="ds-accent">Center</span></>}
          lede="IndexedDB now mirrors and normalizes your workout data, while the legacy keys remain for compatibility with every earlier Workout Tracker release."
          action={<Button variant="ghost" size="sm" onClick={() => go("/gym")}>← Gym Mode</Button>}
        />
      </div>

      <Card tight className="ds-rise ds-rise--1" role="status">
        <span className="ds-muted">{status}</span>
      </Card>

      <div className="ds-rise ds-rise--2">
        <StatGrid cols={4}>
          <Stat label="Workouts" value={stats?.workouts ?? "—"} />
          <Stat label="Routines" value={stats?.routines ?? "—"} />
          <Stat label="Bodyweight" value={stats?.bodyweight ?? "—"} />
          <Stat label="Safety backups" value={stats?.backups ?? "—"} />
          <Stat label="Queued changes" value={stats?.queuedChanges ?? "—"} />
        </StatGrid>
      </div>

      <div className="ds-rise ds-rise--3" style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        <Card>
          <SectionHeader eyebrow="Portable backup" title="Own your workout data" />
          <p className="ds-muted" style={{ margin: "8px 0 0" }}>Export a versioned JSON backup for full restore, or a flat CSV when you want your lifting history in a spreadsheet.</p>
          <div className="ds-grid-2" style={{ marginTop: 14 }}>
            <Button variant="primary" disabled={busy} onClick={exportJson}>Export full JSON</Button>
            <Button variant="secondary" disabled={busy} onClick={exportCsv}>Export workout CSV</Button>
          </div>
        </Card>

        <Card>
          <SectionHeader eyebrow="Restore" title="Recover without guessing" />
          <p className="ds-muted" style={{ margin: "8px 0 0" }}>Before a restore, v1.0 automatically creates another local safety snapshot so you have a way back.</p>
          <div style={{ marginTop: 14 }}>
            <label className="ds-btn ds-btn--secondary ds-btn--md" style={{ cursor: "pointer" }} htmlFor="v10-backup-file">Choose backup JSON</label>
            <input
              id="v10-backup-file"
              style={{ display: "none" }}
              type="file"
              accept="application/json,.json"
              onChange={importBackup}
            />
          </div>
        </Card>

        <Card>
          <SectionHeader eyebrow="Local snapshot" title="Checkpoint before changes" />
          <p className="ds-muted" style={{ margin: "8px 0 0" }}>Create an IndexedDB-only checkpoint before editing history, testing sync, or changing routines.</p>
          <div style={{ marginTop: 14 }}>
            <Button variant="secondary" disabled={busy} onClick={snapshot}>Create safety snapshot</Button>
          </div>
        </Card>
      </div>

      <Card className="ds-rise ds-rise--4">
        <SectionHeader
          eyebrow="Recent safety snapshots"
          title="Rollback points"
          action={<Button variant="ghost" size="sm" onClick={() => go("/history")}>Open workout history →</Button>}
        />
        <div style={{ marginTop: 12 }}>
          {snapshots.length ? (
            <div className="ds-stack">
              {snapshots.map((item) => (
                <ListRow
                  key={item.id}
                  title={<strong>{item.label}</strong>}
                  sub={formatDate(item.createdAt)}
                  trailing={<Button variant="danger" size="sm" disabled={busy} onClick={() => restoreSnapshot(item.id)}>Restore</Button>}
                />
              ))}
            </div>
          ) : (
            <EmptyState title="No safety snapshots yet" body="Create one before your next major routine edit." />
          )}
        </div>
      </Card>

      <Card className="ds-rise ds-rise--4">
        <SectionHeader eyebrow="V1.0 storage model" title="Local-first, with a compatibility mirror" />
        <div className="ds-stack" style={{ marginTop: 12 }}>
          {STORAGE_MODEL.map((step, index) => (
            <ListRow
              key={step}
              icon={<span className="ds-tnum" style={{ fontWeight: 800, color: "var(--ds-volt)" }}>{index + 1}</span>}
              title={step}
            />
          ))}
        </div>
      </Card>
    </PageShell>
  );
}
