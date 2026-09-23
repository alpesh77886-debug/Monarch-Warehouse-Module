"use client";

import Link from "next/link";
import { SignedIn, SignedOut, UserButton, useClerk, useUser } from "@clerk/nextjs";
import { Icon } from "@/components/icons";

// Role names as defined in the permissions contract.
const ROLE_NAMES: Record<string, string> = {
  R01: "Warehouse Executive",
  R02: "Warehouse Operator",
  R03: "Warehouse Incharge",
  R04: "QC Lab Officer",
  R05: "QC Head",
  R06: "Packing Supervisor",
  R07: "Packing Operator",
  R08: "Production Executive",
  R09: "Logistics Coordinator",
  R10: "Security/Gate",
  R11: "Maintenance Technician",
  R12: "Admin",
};

// Only rendered when Clerk is configured (callers check), since Clerk's
// components need the ClerkProvider that the root layout adds only then.
export function AccountControls({ variant }: { variant: "sidebar" | "sheet" }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const role = typeof user?.publicMetadata?.role === "string" ? user.publicMetadata.role : null;
  const name = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Signed in";
  const roleLine = role ? `${ROLE_NAMES[role] ?? "Role"} · ${role}` : "No role assigned yet - ask Admin";
  const handleSignOut = () => signOut({ redirectUrl: "/sign-in" });

  if (variant === "sheet") {
    return (
      <>
        <SignedIn>
          <div className="relative overflow-hidden rounded-[20px] bg-gradient-to-br from-navy-3 via-navy-2 to-navy p-4 text-white shadow-[0_14px_30px_-14px_rgba(11,31,58,.7)]">
            <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-teal/25 blur-2xl" aria-hidden />
            <div className="relative flex items-center gap-3">
              <div className="rounded-full ring-2 ring-white/25">
                <UserButton appearance={{ elements: { avatarBox: "h-11 w-11" } }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-extrabold tracking-tight">{name}</div>
                <div className="mt-1 inline-flex max-w-full items-center rounded-full bg-white/10 px-2 py-0.5 text-[10.5px] font-bold text-[#A7F3D0] ring-1 ring-white/15">
                  <span className="truncate">{roleLine}</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="relative mt-3.5 flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-white/10 text-[13px] font-bold text-white ring-1 ring-white/15 transition active:scale-[0.98] active:bg-white/15"
            >
              <Icon name="logout" size={18} strokeWidth={2.1} />
              Sign Out
            </button>
          </div>
        </SignedIn>
        <SignedOut>
          <Link
            href="/sign-in"
            className="flex h-12 items-center justify-center rounded-[14px] bg-gradient-to-br from-teal to-teal-2 text-sm font-bold text-white shadow-card"
          >
            Sign in
          </Link>
        </SignedOut>
      </>
    );
  }

  return (
    <>
      <SignedIn>
        <div className="flex min-h-[48px] items-center gap-3 px-1">
          <UserButton />
          <div className="hidden min-w-0 flex-1 lg:block">
            <div className="truncate text-[12.5px] font-bold text-white">{name}</div>
            <div className="truncate text-[10.5px] text-[#7F97B7]">{roleLine}</div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Sign Out"
            title="Sign Out"
            className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#8FA3C0] transition hover:bg-white/10 hover:text-white lg:flex"
          >
            <Icon name="logout" size={18} />
          </button>
        </div>
      </SignedIn>
      <SignedOut>
        <Link
          href="/sign-in"
          className="flex min-h-[48px] items-center justify-center rounded-[10px] bg-white/10 px-3 text-sm font-bold text-white"
        >
          Sign in
        </Link>
      </SignedOut>
    </>
  );
}
