"use client";

import Link from "next/link";
import { SignedIn, SignedOut, UserButton, useClerk, useUser } from "@clerk/nextjs";

// Only rendered when Clerk is configured (callers check), since Clerk's
// components need the ClerkProvider that the root layout adds only then.
export function AccountControls({ variant }: { variant: "sidebar" | "sheet" }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const role = typeof user?.publicMetadata?.role === "string" ? user.publicMetadata.role : null;
  const dark = variant === "sidebar";
  return (
    <>
      <SignedIn>
        <div className={"flex min-h-[48px] items-center gap-3 " + (dark ? "px-1" : "")}>
          <UserButton />
          <div className={dark ? "hidden min-w-0 lg:block" : "min-w-0 flex-1"}>
            <div className={"truncate text-[12.5px] font-bold " + (dark ? "text-white" : "text-ink")}>
              {user?.fullName || user?.primaryEmailAddress?.emailAddress || "Signed in"}
            </div>
            <div className={"text-[10.5px] " + (dark ? "text-[#5D7899]" : "text-muted2")}>
              {role ? `Role ${role}` : "No role assigned yet - ask Admin"}
            </div>
          </div>
          {variant === "sheet" && (
            <button
              type="button"
              onClick={() => signOut({ redirectUrl: "/sign-in" })}
              className="ml-auto rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-600 active:bg-red-100"
            >
              Sign Out
            </button>
          )}
        </div>
      </SignedIn>
      <SignedOut>
        <Link
          href="/sign-in"
          className={
            "flex min-h-[48px] items-center justify-center rounded-[10px] px-3 text-sm font-bold " +
            (dark ? "bg-white/10 text-white" : "bg-teal text-white")
          }
        >
          Sign in
        </Link>
      </SignedOut>
    </>
  );
}
