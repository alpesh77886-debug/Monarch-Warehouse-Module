import { SignUp } from "@clerk/nextjs";
import { getClerkConfigStatus } from "@/lib/clerk-config";
import { AuthNotice, AuthShell } from "@/components/layout/AuthShell";

export default function SignUpPage() {
  return (
    <AuthShell>
      {getClerkConfigStatus() !== "configured" ? (
        <AuthNotice>
          Sign-up is not configured yet - this app is running in Clerk stub
          mode pending a real Clerk application.
        </AuthNotice>
      ) : (
        <div className="flex justify-center">
          <SignUp />
        </div>
      )}
    </AuthShell>
  );
}
