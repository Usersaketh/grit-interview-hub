"use client";

import { useEffect } from "react";
import { MotionConfig } from "motion/react";
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
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </MotionConfig>
  );
}
