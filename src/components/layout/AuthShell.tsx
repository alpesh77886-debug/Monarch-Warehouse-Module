import type { ReactNode } from "react";

// Branded full-screen frame for the sign-in / sign-up pages.
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-navy-3 via-navy to-[#06142A] px-4 py-10">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-teal/25 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-32 -right-20 h-80 w-80 rounded-full bg-sky/20 blur-3xl" aria-hidden />
      <div className="relative mb-7 flex flex-col items-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-gradient-to-br from-[#14B8A6] to-teal-2 text-lg font-extrabold tracking-tight text-white shadow-[0_16px_36px_-12px_rgba(13,148,136,.8)] ring-1 ring-white/20">
          IBF
        </div>
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-white">FG Warehouse</h1>
        <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#7F97B7]">
          Iscon Balaji Foods &middot; Limbasi Plant
        </p>
      </div>
      <div className="relative w-full max-w-md">{children}</div>
    </main>
  );
}

export function AuthNotice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/95 p-6 text-center text-sm text-ink2 shadow-elevated">{children}</div>
  );
}
