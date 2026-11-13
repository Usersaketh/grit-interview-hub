import { Suspense } from "react";
import { LoginView } from "@frontend/features/auth/LoginView";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--bg-canvas)] text-sm text-[var(--text-secondary)]">
          Loading sign-in form...
        </div>
      }
    >
      <LoginView />
    </Suspense>
  );
}
