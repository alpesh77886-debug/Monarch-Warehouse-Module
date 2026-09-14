import { SignUp } from "@clerk/nextjs";
import { getClerkConfigStatus } from "@/lib/clerk-config";

export default function SignUpPage() {
  if (getClerkConfigStatus() !== "configured") {
    return (
      <main className="flex min-h-screen items-center justify-center p-6 text-center text-sm text-muted">
        Sign-up is not configured yet - this app is running in Clerk stub
        mode pending a real Clerk application.
      </main>
    );
  }
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <SignUp />
    </main>
  );
}
