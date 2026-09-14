import { SignIn } from "@clerk/nextjs";
import { getClerkConfigStatus } from "@/lib/clerk-config";

export default function SignInPage() {
  if (getClerkConfigStatus() !== "configured") {
    return (
      <main className="flex min-h-screen items-center justify-center p-6 text-center text-sm text-muted">
        Sign-in is not configured yet - this app is running in Clerk stub
        mode pending a real Clerk application.
      </main>
    );
  }
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <SignIn />
    </main>
  );
}
