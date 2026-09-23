"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, Pill, StateBox, inputClass } from "@/components/ui";
import { Icon } from "@/components/icons";
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

// Reference .rc-e/.rc-f/.rc-p/.rc-m/.rc-h/.rc-x swatches.
const COLOR_CLASSES: Record<RackMapColor, string> = {
  green: "bg-[#ECFDF5] border-[#A7F3D0] text-[#047857]",
  red: "bg-[#FEE2E2] border-[#FCA5A5] text-[#B91C1C]",
  blue: "bg-[#DBEAFE] border-[#93C5FD] text-[#1D4ED8]",
  orange: "bg-[#FFEDD5] border-[#FDBA74] text-[#C2410C]",
  grey: "bg-[#E2E8F0] border-[#CBD5E1] text-[#64748B]",
  yellow: "bg-[#FEF9C3] border-[#FDE047] text-[#A16207]",
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

  const roomLocations = locations.filter((l) => l.coldRoom === currentColdRoom);
  const roomOccupied = roomLocations.filter((l) => l.status === "OCCUPIED" || l.status === "PARTIAL").length;
  const roomUsable = roomLocations.filter((l) => l.status !== "BLOCKED").length;
  const roomPct = roomUsable === 0 ? 0 : Math.round((roomOccupied / roomUsable) * 100);

  function renderCell(loc: Location, label: string, compact: boolean) {
    const occupant = loc.currentPalletId ? palletById.get(loc.currentPalletId) ?? null : null;
    const color = rackMapCellColor(
      loc,
      occupant ? { statusCode: occupant.statusCode, distinctBatchCount: occupant.distinctBatchCount } : null
    );
    const isMatch = matchesSearch(loc);
    const second =
      color === "green"
        ? "empty"
        : color === "grey"
          ? "blocked"
          : color === "orange"
            ? "⚠ HOLD"
            : color === "yellow" && occupant
              ? `${occupant.distinctBatchCount} batches`
              : occupant
                ? `${occupant.totalCartons} ctn`
                : RACK_MAP_COLOR_LABEL[color];
    return (
      <button
        key={loc.id}
        type="button"
        onClick={() => setSelected(loc)}
        className={
          "flex min-h-[52px] flex-col items-center justify-center rounded-[9px] border-[1.5px] px-1 py-1.5 font-bold transition hover:-translate-y-0.5 hover:shadow-[0_10px_22px_-8px_rgba(15,23,42,.35)] " +
          COLOR_CLASSES[color] +
          (isMatch ? " ring-2 ring-accent ring-offset-1" : "") +
          (compact ? " w-[72px]" : "")
        }
        title={loc.fullCode}
        aria-label={`${loc.fullCode} - ${RACK_MAP_COLOR_LABEL[color]}${occupant ? `, pallet ${occupant.palletNumber}, ${occupant.materialCode}` : ""}`}
      >
        <span className="text-[11.5px] font-extrabold">{label}</span>
        <span className="mt-0.5 text-[9px] opacity-80">{second}</span>
      </button>
    );
  }

  return (
    <>
      <PageHeader
        title={currentColdRoom ? `Rack Map — ${currentColdRoom}` : "Rack Map"}
        actions={
          coldRooms.length > 0 ? (
            <div className="flex rounded-[11px] bg-[#F1F5F9] p-1" role="group" aria-label="Cold room">
              {coldRooms.map((cr) => (
                <button
                  key={cr}
                  type="button"
                  onClick={() => setActiveColdRoom(cr)}
                  className={
                    "min-h-[44px] min-w-[56px] rounded-lg px-4 text-sm font-bold transition " +
                    (cr === currentColdRoom
                      ? "bg-gradient-to-br from-navy-3 to-navy text-white shadow-card"
                      : "bg-transparent text-muted")
                  }
                >
                  {cr}
                </button>
              ))}
            </div>
          ) : null
        }
      />
      <div className="flex flex-col gap-4 bg-canvas p-4 sm:p-6">
        {state === "loading" ? (
          <StateBox>Loading rack map...</StateBox>
        ) : state === "error" ? (
          <StateBox tone="danger">{error}</StateBox>
        ) : locations.length === 0 ? (
          <StateBox>
            No locations exist yet - add some in{" "}
            <a href="/storage/locations" className="font-bold text-teal underline">
              Locations
            </a>
            .
          </StateBox>
        ) : (
          <>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted2"><Icon name="search" size={18} /></span>
              <input
                className={inputClass() + " pl-10"}
                placeholder="Search material, batch, or pallet number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-semibold text-ink2">
              {(Object.keys(RACK_MAP_COLOR_LABEL) as RackMapColor[]).map((c) => (
                <span key={c} className="flex items-center gap-1.5">
                  <span className={"h-3.5 w-3.5 rounded border " + COLOR_CLASSES[c]} />
                  {RACK_MAP_COLOR_LABEL[c]}
                </span>
              ))}
              <span className="flex items-center gap-1.5">
                <span className="h-3.5 w-3.5 rounded border-2 border-accent" />
                Search match
              </span>
              <span className="sm:ml-auto">
                <Pill tone="ok">
                  {currentColdRoom}: {roomPct}% occupied · {roomOccupied}/{roomUsable} positions
                </Pill>
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {blocks.map(([blockName, blockLocations]) => {
                const occupied = blockLocations.filter((l) => l.status === "OCCUPIED" || l.status === "PARTIAL").length;
                const positions = Array.from(new Set(blockLocations.map((l) => l.position).filter((p): p is string => !!p))).sort();
                const floors = Array.from(new Set(blockLocations.map((l) => l.floor).filter((f): f is number => f !== null))).sort(
                  (x, y) => y - x
                );
                const isMatrix =
                  positions.length > 0 && floors.length > 0 && blockLocations.every((l) => l.position && l.floor !== null);
                const byKey = new Map(blockLocations.map((l) => [`${l.position}|${l.floor}`, l]));
                return (
                  <Card
                    key={blockName}
                    title={`Block ${blockName}`}
                    sub={
                      isMatrix
                        ? `Positions ${positions[0]}–${positions[positions.length - 1]} × Floors ${floors[floors.length - 1]}–${floors[0]} · ${occupied}/${blockLocations.length}`
                        : `${occupied}/${blockLocations.length} occupied`
                    }
                  >
                    {isMatrix ? (
                      <div className="overflow-x-auto">
                        <div
                          className="grid min-w-[300px] gap-2"
                          style={{ gridTemplateColumns: `40px repeat(${positions.length}, minmax(48px, 1fr))` }}
                        >
                          <div className="flex items-end justify-center pb-1 text-[8px] font-extrabold uppercase leading-tight text-muted2">
                            Floor↓
                          </div>
                          {positions.map((pos) => (
                            <div key={pos} className="text-center text-[11px] font-extrabold text-muted2">
                              {pos}
                            </div>
                          ))}
                          {floors.map((fl) => (
                            <FloorRow key={fl} floor={fl}>
                              {positions.map((pos) => {
                                const loc = byKey.get(`${pos}|${fl}`);
                                return loc ? (
                                  renderCell(loc, `${pos}-${fl}`, false)
                                ) : (
                                  <div key={pos} className="rounded-[9px] border border-dashed border-line" />
                                );
                              })}
                            </FloorRow>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {blockLocations.map((loc) =>
                          renderCell(loc, `${loc.position ?? loc.fullCode}${loc.floor ? `-${loc.floor}` : ""}`, true)
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
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

function FloorRow({ floor, children }: { floor: number; children: React.ReactNode }) {
  return (
    <>
      <div className="flex items-center justify-center text-[11px] font-extrabold text-muted2">F{floor}</div>
      {children}
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-t-2xl bg-navy p-5 text-[13px] leading-7 text-[#CBD5E1] shadow-[0_16px_40px_-10px_rgba(11,31,58,.55)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-[#2DD4BF]">📍 {location.fullCode}</h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] min-w-[48px] rounded-lg text-xl text-[#8FA3C0]"
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <div className="text-xs text-[#8FA3C0]">Status: {location.status}</div>
        {pallet ? (
          <div className="mt-2 flex flex-col">
            <div>
              Pallet: <span className="font-bold text-white">{pallet.palletNumber}</span>
            </div>
            <div>
              Material: <span className="font-bold text-white">{pallet.materialCode}</span>
            </div>
            <div>
              {pallet.totalCartons} cartons | {pallet.totalWeightKg} kg
            </div>
            <div
              className={
                pallet.statusCode === "OK"
                  ? "text-[#34D399]"
                  : pallet.statusCode === "HOLD" || pallet.statusCode === "QC_HOLD"
                    ? "text-[#FBBF24]"
                    : "text-white"
              }
            >
              Pallet status: {pallet.statusCode}
            </div>
            {pallet.distinctBatchCount > 1 ? (
              <div className="font-bold text-[#FDE047]">Mix of {pallet.distinctBatchCount} batches</div>
            ) : null}
          </div>
        ) : (
          <div className="mt-2 text-[#8FA3C0]">No pallet at this location.</div>
        )}
      </div>
    </div>
  );
}
