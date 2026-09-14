"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";

type Pallet = {
  id: string;
  palletNumber: string;
  materialCode: string;
  statusCode: string;
  currentLocationId: string | null;
};

type Location = {
  id: string;
  fullCode: string;
  status: "EMPTY" | "OCCUPIED" | "PARTIAL" | "BLOCKED";
  capacityPallets: number;
};

type LoadState = "loading" | "ready" | "error";

export default function PutawayPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [pallets, setPallets] = useState<Pallet[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  const [selectedLocation, setSelectedLocation] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const [actionNotice, setActionNotice] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  async function loadAll() {
    setState("loading");
    setError(null);
    try {
      const [palletsRes, locationsRes] = await Promise.all([
        fetch("/api/pallets"),
        fetch("/api/storage/locations"),
      ]);
      const palletsBody = await palletsRes.json();
      const locationsBody = await locationsRes.json();
      if (!palletsRes.ok) throw new Error(palletsBody?.error ?? "Could not load pallets.");
      if (!locationsRes.ok) throw new Error(locationsBody?.error ?? "Could not load locations.");
      setPallets(palletsBody.pallets as Pallet[]);
      setLocations(locationsBody.locations as Location[]);
      setState("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load putaway data.");
      setState("error");
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function handleAssign(palletId: string) {
    const locationId = selectedLocation[palletId];
    if (!locationId) return;
    await submit(palletId, "/api/storage/putaway", { palletId, locationId });
  }

  async function handleMove(palletId: string) {
    const locationId = selectedLocation[palletId];
    const moveReason = reason[palletId];
    if (!locationId || !moveReason) return;
    await submit(palletId, "/api/storage/move", { palletId, locationId, reason: moveReason });
  }

  async function submit(palletId: string, url: string, body: unknown) {
    setSubmitting(palletId);
    setActionNotice((prev) => ({ ...prev, [palletId]: "" }));
    setActionError((prev) => ({ ...prev, [palletId]: "" }));
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const responseBody = await res.json();
      if (!res.ok) {
        if (res.status === 503) {
          setActionNotice((prev) => ({ ...prev, [palletId]: responseBody.error }));
        } else {
          setActionError((prev) => ({ ...prev, [palletId]: responseBody.error ?? `Request failed (${res.status}).` }));
        }
        return;
      }
      await loadAll();
    } catch {
      setActionError((prev) => ({ ...prev, [palletId]: "Network error - could not reach the server." }));
    } finally {
      setSubmitting(null);
    }
  }

  const unassigned = pallets.filter((p) => !p.currentLocationId);
  const assigned = pallets.filter((p) => p.currentLocationId);

  return (
    <>
      <PageHeader breadcrumb="Home / Storage / Putaway & Move" title="Putaway & Move" />
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        {state === "loading" ? (
          <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">
            Loading...
          </div>
        ) : state === "error" ? (
          <div className="rounded-xl border border-danger bg-danger-light p-6 text-sm text-danger shadow-card" role="alert">
            {error}
          </div>
        ) : pallets.length === 0 ? (
          <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">
            No pallets exist yet - pallets come from the Receiving Sheet flow, which is not built yet.
          </div>
        ) : (
          <>
            <section>
              <h2 className="mb-3 text-sm font-bold text-navy">Awaiting putaway ({unassigned.length})</h2>
              {unassigned.length === 0 ? (
                <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">
                  Every pallet already has a location.
                </div>
              ) : (
                <ul className="flex flex-col gap-3">
                  {unassigned.map((p) => (
                    <li key={p.id} className="rounded-xl border border-line bg-white p-4 shadow-card">
                      <div className="text-sm font-bold text-navy">
                        Pallet {p.palletNumber} · {p.materialCode}
                      </div>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <select
                          className={selectClass}
                          value={selectedLocation[p.id] ?? ""}
                          onChange={(e) =>
                            setSelectedLocation((prev) => ({ ...prev, [p.id]: e.target.value }))
                          }
                        >
                          <option value="">Select a location...</option>
                          {locations
                            .filter((l) => l.status !== "BLOCKED")
                            .map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.fullCode} ({l.status})
                              </option>
                            ))}
                        </select>
                        <button
                          type="button"
                          disabled={!selectedLocation[p.id] || submitting === p.id}
                          onClick={() => handleAssign(p.id)}
                          className="min-h-[48px] rounded-lg bg-teal px-4 text-sm font-bold text-white disabled:opacity-60"
                        >
                          {submitting === p.id ? "Assigning..." : "Assign"}
                        </button>
                      </div>
                      <ActionMessages notice={actionNotice[p.id]} error={actionError[p.id]} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className="mb-3 text-sm font-bold text-navy">Located pallets ({assigned.length})</h2>
              {assigned.length === 0 ? (
                <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">
                  No pallet has a location yet.
                </div>
              ) : (
                <ul className="flex flex-col gap-3">
                  {assigned.map((p) => (
                    <li key={p.id} className="rounded-xl border border-line bg-white p-4 shadow-card">
                      <div className="text-sm font-bold text-navy">
                        Pallet {p.palletNumber} · {p.materialCode}
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        Currently at:{" "}
                        {locations.find((l) => l.id === p.currentLocationId)?.fullCode ?? p.currentLocationId}
                      </div>
                      <div className="mt-3 flex flex-col gap-2">
                        <select
                          className={selectClass}
                          value={selectedLocation[p.id] ?? ""}
                          onChange={(e) =>
                            setSelectedLocation((prev) => ({ ...prev, [p.id]: e.target.value }))
                          }
                        >
                          <option value="">Select a new location...</option>
                          {locations
                            .filter((l) => l.status !== "BLOCKED" && l.id !== p.currentLocationId)
                            .map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.fullCode} ({l.status})
                              </option>
                            ))}
                        </select>
                        <input
                          className={selectClass}
                          placeholder="Reason for move (required)"
                          value={reason[p.id] ?? ""}
                          onChange={(e) => setReason((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        />
                        <button
                          type="button"
                          disabled={!selectedLocation[p.id] || !reason[p.id] || submitting === p.id}
                          onClick={() => handleMove(p.id)}
                          className="min-h-[48px] rounded-lg bg-teal px-4 text-sm font-bold text-white disabled:opacity-60"
                        >
                          {submitting === p.id ? "Moving..." : "Move"}
                        </button>
                      </div>
                      <ActionMessages notice={actionNotice[p.id]} error={actionError[p.id]} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}

function ActionMessages({ notice, error }: { notice?: string; error?: string }) {
  return (
    <>
      {notice ? (
        <p className="mt-2 rounded-lg bg-warning-light p-2 text-xs font-semibold text-warning" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 rounded-lg bg-danger-light p-2 text-xs font-semibold text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

const selectClass =
  "min-h-[48px] w-full rounded-lg border border-line bg-white px-3 text-sm text-ink2 outline-none focus:border-teal";
