"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  Field,
  ListRow,
  PageHeader,
  PageShell,
  SectionHeader,
  Stat,
  StatGrid,
  TextInput,
} from "../ui";

const BODYWEIGHT_KEY = "workout-tracker:v0.6:bodyweight";

type BodyweightEntry = { id: string; value: number; recordedAt: string };

function safeArray(raw: string | null): BodyweightEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toDateInput(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export default function BodyweightManager() {
  const [entries, setEntries] = useState<BodyweightEntry[]>([]);
  const [weight, setWeight] = useState("");
  const [date, setDate] = useState(() => toDateInput(new Date().toISOString()));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editWeight, setEditWeight] = useState("");
  const [editDate, setEditDate] = useState("");

  useEffect(() => {
    setEntries(safeArray(localStorage.getItem(BODYWEIGHT_KEY)));
  }, []);

  const sorted = useMemo(() => [...entries].sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()), [entries]);
  const current = sorted[0]?.value ?? null;
  const previous = sorted[1]?.value ?? null;
  const delta = current != null && previous != null ? current - previous : null;

  function persist(next: BodyweightEntry[]) {
    const ordered = [...next].sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()).slice(0, 365);
    setEntries(ordered);
    localStorage.setItem(BODYWEIGHT_KEY, JSON.stringify(ordered));
  }

  function addEntry() {
    const value = Number(weight);
    if (!Number.isFinite(value) || value <= 0 || value > 1000 || !date) return;
    const recordedAt = new Date(`${date}T12:00:00`).toISOString();
    persist([{ id: `weight-${Date.now()}`, value, recordedAt }, ...entries]);
    setWeight("");
  }

  function beginEdit(entry: BodyweightEntry) {
    setEditingId(entry.id);
    setEditWeight(String(entry.value));
    setEditDate(toDateInput(entry.recordedAt));
  }

  function saveEdit() {
    if (!editingId) return;
    const value = Number(editWeight);
    if (!Number.isFinite(value) || value <= 0 || value > 1000 || !editDate) return;
    const recordedAt = new Date(`${editDate}T12:00:00`).toISOString();
    persist(entries.map((entry) => entry.id === editingId ? { ...entry, value, recordedAt } : entry));
    setEditingId(null);
  }

  function removeEntry(id: string) {
    if (!window.confirm("Delete this bodyweight entry?")) return;
    persist(entries.filter((entry) => entry.id !== id));
    if (editingId === id) setEditingId(null);
  }

  const go = (href: string) => { window.location.href = href; };

  return (
    <PageShell>
      <div className="ds-rise">
        <PageHeader
          eyebrow="Bodyweight"
          eyebrowVolt
          title="Bodyweight"
          lede="Log it, correct mistakes, and keep the history clean."
          action={<Button variant="ghost" size="sm" onClick={() => go("/progress")}>← Progress</Button>}
        />
      </div>

      <div className="ds-rise ds-rise--1">
        <StatGrid cols={3}>
          <Stat label="Current" value={current == null ? "—" : `${current} lb`} />
          <Stat label="Previous" value={previous == null ? "—" : `${previous} lb`} />
          <Stat label="Change" value={delta == null ? "—" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} lb`} />
        </StatGrid>
      </div>

      <Card className="ds-rise ds-rise--2">
        <SectionHeader eyebrow="New entry" title="Log bodyweight" />
        <div className="ds-stack" style={{ marginTop: 12 }}>
          <div className="ds-grid-2">
            <Field label="Weight" suffix="lb">
              <TextInput type="number" inputMode="decimal" min={1} max={1000} step={0.1} value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="145.0" />
            </Field>
            <Field label="Date">
              <TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </Field>
          </div>
          <Button variant="primary" block onClick={addEntry}>Add entry</Button>
        </div>
      </Card>

      <Card className="ds-rise ds-rise--3">
        <SectionHeader eyebrow="History" title="Entries" action={<span className="ds-muted" style={{ fontSize: "0.78rem" }}>{sorted.length} logged</span>} />
        <div style={{ marginTop: 12 }}>
          {sorted.length ? (
            <div className="ds-stack">
              {sorted.map((entry) => editingId === entry.id ? (
                <Card tight key={entry.id}>
                  <div className="ds-stack">
                    <div className="ds-grid-2">
                      <Field label="Weight" suffix="lb">
                        <TextInput type="number" inputMode="decimal" step={0.1} value={editWeight} onChange={(event) => setEditWeight(event.target.value)} />
                      </Field>
                      <Field label="Date">
                        <TextInput type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} />
                      </Field>
                    </div>
                    <div className="ds-cluster">
                      <Button variant="primary" size="sm" onClick={saveEdit}>Save</Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                    </div>
                  </div>
                </Card>
              ) : (
                <ListRow
                  key={entry.id}
                  title={<strong>{entry.value} lb</strong>}
                  sub={displayDate(entry.recordedAt)}
                  trailing={
                    <div className="ds-cluster">
                      <Button variant="ghost" size="sm" onClick={() => beginEdit(entry)}>Edit</Button>
                      <Button variant="danger" size="sm" onClick={() => removeEntry(entry.id)}>Delete</Button>
                    </div>
                  }
                />
              ))}
            </div>
          ) : (
            <EmptyState title="No bodyweight entries yet" body="Log your first weigh-in above to start the trend." />
          )}
        </div>
      </Card>
    </PageShell>
  );
}
