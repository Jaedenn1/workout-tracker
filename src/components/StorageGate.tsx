"use client";

import { useEffect, useState, type ReactNode } from "react";
import { bootstrapIndexedDb, installStorageMirror } from "../lib/database";

export default function StorageGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    let alive = true;

    async function boot() {
      try {
        await bootstrapIndexedDb();
        installStorageMirror();
      } catch {
        setFallback(true);
      } finally {
        if (alive) setReady(true);
      }
    }

    void boot();
    return () => {
      alive = false;
    };
  }, []);

  if (!ready) {
    return (
      <main className="v10-storage-loading" aria-live="polite">
        <div>
          <strong>Workout Tracker</strong>
          <span>Checking local workout database…</span>
        </div>
      </main>
    );
  }

  return (
    <>
      {fallback && (
        <div className="v10-storage-warning" role="status">
          IndexedDB is unavailable on this browser. Workout Tracker is using the legacy device-storage fallback for this session.
        </div>
      )}
      {children}
    </>
  );
}
