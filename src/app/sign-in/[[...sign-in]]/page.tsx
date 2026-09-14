import { SignIn } from "@clerk/nextjs";

const hasClerkPublishableKey = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default function SignInPage() {
  if (!hasClerkPublishableKey) {
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
