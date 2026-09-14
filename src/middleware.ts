import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * STUB MODE: no real Clerk application exists yet (Alpesh has not
 * created one - see .env.example / docs/PENDING_ITEMS.md). Until
 * NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY are set, this
 * middleware is a no-op pass-through so local dev and the build both
 * work without a real account. This is NOT authentication enforcement
 * - real route protection is wired once real keys exist (TASK-002).
 */
const hasClerkKeys = Boolean(
  process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
);

export default hasClerkKeys
  ? clerkMiddleware()
  : function noopMiddleware() {
      return NextResponse.next();
    };

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
