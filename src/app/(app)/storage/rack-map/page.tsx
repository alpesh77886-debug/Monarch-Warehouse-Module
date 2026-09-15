"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { rackMapCellColor, RACK_MAP_COLOR_LABEL, type RackMapColor } from "@/lib/rack-map";

type Location = {
  id: string;
  coldRoom: "CR1" | "CR2" | "FLOOR" | "NA";
  block: string | null;
  position: string | null;
  floor: number | null;
  fullCode: string;
  status: "EMPTY" | "OCCUPIED" | "PARTIAL" | "BLOCKED";
  currentPalletId: string | null;
};

type Pallet = {
  id: string;
  palletNumber: string;
  materialCode: string;
  statusCode: string;
  totalCartons: number;
  totalWeightKg: number;
  distinctBatchCount: number;
};

type LoadState = "loading" | "ready" | "error";

const COLOR_CLASSES: Record<RackMapColor, string> = {
  green: "bg-success-light border-success text-success",
  red: "bg-danger-light border-danger text-danger",
  blue: "bg-sky-light border-sky text-sky",
  orange: "bg-warning-light border-warning text-warning",
  grey: "bg-line border-muted2 text-muted",
  // Tailwind's default "yellow" scale (not the "warning" design token,
  // which is already amber-ish and used for orange/HOLD above - reusing
  // it here would make mix and hold look the same color).
  yellow: "bg-yellow-100 border-yellow-500 text-yellow-700",
};

export default function RackMapPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [pallets, setPallets] = useState<Pallet[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Location | null>(null);
  const [activeColdRoom, setActiveColdRoom] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setState("loading");
      setError(null);
      try {
        const [locRes, palRes] = await Promise.all([
          fetch("/api/storage/locations"),
          fetch("/api/pallets"),
        ]);
        const locBody = await locRes.json();
        const palBody = await palRes.json();
        if (!locRes.ok) throw new Error(locBody?.error ?? "Could not load locations.");
        if (!palRes.ok) throw new Error(palBody?.error ?? "Could not load pallets.");
        setLocations(locBody.locations as Location[]);
        setPallets(palBody.pallets as Pallet[]);
        setState("ready");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load the rack map.");
        setState("error");
      }
    }
    load();
  }, []);

  const palletById = useMemo(() => new Map(pallets.map((p) => [p.id, p])), [pallets]);

  const coldRooms = useMemo(() => {
    const set = new Set(locations.map((l) => l.coldRoom));
    return Array.from(set).sort();
  }, [locations]);

  const currentColdRoom = activeColdRoom ?? coldRooms[0] ?? null;

  const blocks = useMemo(() => {
    const filtered = locations.filter((l) => l.coldRoom === currentColdRoom);
    const byBlock = new Map<string, Location[]>();
    for (const loc of filtered) {
      const key = loc.block ?? "(no block)";
      if (!byBlock.has(key)) byBlock.set(key, []);
      byBlock.get(key)!.push(loc);
    }
    return Array.from(byBlock.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [locations, currentColdRoom]);

  const searchLower = search.trim().toLowerCase();
  function matchesSearch(location: Location): boolean {
    if (!searchLower) return false;
    const occupant = location.currentPalletId ? palletById.get(location.currentPalletId) : null;
    return (
      location.fullCode.toLowerCase().includes(searchLower) ||
      (occupant?.materialCode.toLowerCase().includes(searchLower) ?? false) ||
      (occupant?.palletNumber.toLowerCase().includes(searchLower) ?? false)
    );
  }

  return (
    <>
      <PageHeader breadcrumb="Home / Storage / Rack Map" title="Rack Map" />
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        {state === "loading" ? (
          <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">
            Loading rack map...
          </div>
        ) : state === "error" ? (
          <div className="rounded-xl border border-danger bg-danger-light p-6 text-sm text-danger shadow-card" role="alert">
            {error}
          </div>
        ) : locations.length === 0 ? (
          <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">
            No locations exist yet - add some in{" "}
            <a href="/storage/locations" className="font-bold text-teal underline">
              Locations
            </a>
            .
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {coldRooms.map((cr) => (
                <button
                  key={cr}
                  type="button"
                  onClick={() => setActiveColdRoom(cr)}
                  className={
                    "min-h-[48px] rounded-lg border px-4 text-sm font-bold " +
                    (cr === currentColdRoom
                      ? "border-teal bg-teal text-white"
                      : "border-line bg-white text-ink2")
                  }
                >
                  {cr}
                </button>
              ))}
            </div>

            <input
              className="min-h-[48px] w-full rounded-lg border border-line bg-white px-3 text-sm text-ink2 outline-none focus:border-teal"
              placeholder="Search material, batch, or pallet number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <div className="flex flex-wrap gap-3 text-xs text-muted">
              {(Object.keys(RACK_MAP_COLOR_LABEL) as RackMapColor[]).map((c) => (
                <span key={c} className="flex items-center gap-1">
                  <span className={"h-3 w-3 rounded-full border " + COLOR_CLASSES[c]} />
                  {RACK_MAP_COLOR_LABEL[c]}
                </span>
              ))}
              <span className="flex items-center gap-1">
                <span className="h-3 w-3 rounded-full border-2 border-accent" />
                Search match
              </span>
            </div>

            <div className="flex flex-col gap-6">
              {blocks.map(([blockName, blockLocations]) => (
                <div key={blockName}>
                  <div className="mb-2 text-xs font-bold uppercase text-muted2">Block {blockName}</div>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                    {blockLocations.map((loc) => {
                      const occupant = loc.currentPalletId ? palletById.get(loc.currentPalletId) ?? null : null;
                      const color = rackMapCellColor(
                        loc,
                        occupant
                          ? { statusCode: occupant.statusCode, distinctBatchCount: occupant.distinctBatchCount }
                          : null
                      );
                      const isMatch = matchesSearch(loc);
                      return (
                        <button
                          key={loc.id}
                          type="button"
                          onClick={() => setSelected(loc)}
                          className={
                            "flex min-h-[48px] flex-col items-center justify-center rounded-lg border-2 p-1 text-[10px] font-bold " +
                            COLOR_CLASSES[color] +
                            (isMatch ? " ring-2 ring-accent" : "")
                          }
                          title={loc.fullCode}
                          aria-label={`${loc.fullCode} - ${RACK_MAP_COLOR_LABEL[color]}${occupant ? `, pallet ${occupant.palletNumber}, ${occupant.materialCode}` : ""}`}
                        >
                          <span>{loc.position ?? loc.fullCode}</span>
                          {loc.floor ? <span className="text-[9px] opacity-75">F{loc.floor}</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {selected ? (
          <PalletDetailPopup
            location={selected}
            pallet={selected.currentPalletId ? palletById.get(selected.currentPalletId) ?? null : null}
            onClose={() => setSelected(null)}
          />
        ) : null}
      </div>
    </>
  );
}

function PalletDetailPopup({
  location,
  pallet,
  onClose,
}: {
  location: Location;
  pallet: Pallet | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-elevated sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-navy">{location.fullCode}</h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] min-w-[48px] rounded-lg text-lg text-muted"
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <div className="mt-2 text-xs text-muted">Status: {location.status}</div>
        {pallet ? (
          <div className="mt-3 flex flex-col gap-1 text-sm text-ink2">
            <div>
              Pallet: <span className="font-bold">{pallet.palletNumber}</span>
            </div>
            <div>Material: {pallet.materialCode}</div>
            <div>
              {pallet.totalCartons} cartons | {pallet.totalWeightKg} kg
            </div>
            <div>Pallet status: {pallet.statusCode}</div>
            {pallet.distinctBatchCount > 1 ? (
              <div className="font-bold text-yellow-700">Mix of {pallet.distinctBatchCount} batches</div>
            ) : null}
          </div>
        ) : (
          <div className="mt-3 text-sm text-muted">No pallet at this location.</div>
        )}
      </div>
    </div>
  );
}
