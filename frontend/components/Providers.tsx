"use client";

import { useEffect } from "react";
import { AuthProvider } from "@frontend/hooks/useAuth";
import { ThemeProvider } from "@frontend/hooks/useTheme";
import { ToastProvider } from "@frontend/hooks/useToast";
import {
  setRuntimeSupabaseConfig,
  type PublicSupabaseConfig,
} from "@frontend/services/supabaseBrowser";

export function Providers({
  children,
  publicConfig,
}: {
  children: React.ReactNode;
  publicConfig?: PublicSupabaseConfig;
}) {
  setRuntimeSupabaseConfig(publicConfig);

  useEffect(() => {
    setRuntimeSupabaseConfig(publicConfig);
  }, [publicConfig]);

  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>{children}</AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
