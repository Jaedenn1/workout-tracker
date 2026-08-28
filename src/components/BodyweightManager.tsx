"use client";

import { useEffect, useMemo, useState } from "react";

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

  return (
    <main className="v16-shell">
      <header className="v16-page-header v16-page-header-row">
        <div>
          <p className="v16-kicker">BODYWEIGHT</p>
          <h1>Bodyweight</h1>
          <p>Log it, correct mistakes, and keep the history clean.</p>
        </div>
        <a className="v16-back-button" href="/progress">← Progress</a>
      </header>

      <section className="v16-weight-overview">
        <div><span>Current</span><strong>{current == null ? "—" : `${current} lb`}</strong></div>
        <div><span>Previous</span><strong>{previous == null ? "—" : `${previous} lb`}</strong></div>
        <div><span>Change</span><strong>{delta == null ? "—" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} lb`}</strong></div>
      </section>

      <section className="v16-panel v16-weight-add">
        <div className="v16-section-head"><div><p className="v16-kicker">NEW ENTRY</p><h2>Log bodyweight</h2></div></div>
        <div className="v16-weight-form">
          <label><span>Weight (lb)</span><input type="number" inputMode="decimal" min="1" max="1000" step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="145.0" /></label>
          <label><span>Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <button type="button" onClick={addEntry}>Add entry</button>
        </div>
      </section>

      <section className="v16-panel">
        <div className="v16-section-head"><div><p className="v16-kicker">HISTORY</p><h2>Entries</h2></div><span>{sorted.length} logged</span></div>
        <div className="v16-weight-list">
          {sorted.length ? sorted.map((entry) => editingId === entry.id ? (
            <div className="v16-weight-row editing" key={entry.id}>
              <div className="v16-weight-edit-fields">
                <label><span>Weight</span><input type="number" inputMode="decimal" step="0.1" value={editWeight} onChange={(event) => setEditWeight(event.target.value)} /></label>
                <label><span>Date</span><input type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} /></label>
              </div>
              <div className="v16-row-actions"><button type="button" onClick={saveEdit}>Save</button><button type="button" onClick={() => setEditingId(null)}>Cancel</button></div>
            </div>
          ) : (
            <div className="v16-weight-row" key={entry.id}>
              <div><strong>{entry.value} lb</strong><span>{displayDate(entry.recordedAt)}</span></div>
              <div className="v16-row-actions"><button type="button" onClick={() => beginEdit(entry)}>Edit</button><button className="danger" type="button" onClick={() => removeEntry(entry.id)}>Delete</button></div>
            </div>
          )) : <div className="v16-empty">No bodyweight entries yet.</div>}
        </div>
      </section>
    </main>
  );
}
