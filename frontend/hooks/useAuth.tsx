"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { ApiClientError, formatApiErrorMessage } from "@frontend/services/apiClient";
import { clearAllHubCaches } from "@frontend/services/dataCache";
import { fetchProfile } from "@frontend/services/hubApi";
import {
  getSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@frontend/services/supabaseBrowser";
import type { UserProfile } from "@frontend/types/api";

interface RefreshOptions {
  silent?: boolean;
  force?: boolean;
}

interface AuthContextValue {
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  supabaseConfigured: boolean;
  refreshProfile: (options?: RefreshOptions) => Promise<UserProfile | null>;
  signIn: (email: string, password: string) => Promise<UserProfile>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const supabaseConfigured = isSupabaseConfigured();

  const activeUserIdRef = useRef<string | null>(null);
  const hasResolvedInitialRef = useRef<boolean>(false);
  const inFlightProfileRef = useRef<Promise<UserProfile | null> | null>(null);

  const refreshProfile = useCallback(
    async (options?: RefreshOptions): Promise<UserProfile | null> => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (activeUserIdRef.current !== null) {
          clearAllHubCaches();
          activeUserIdRef.current = null;
        }
        hasResolvedInitialRef.current = true;
        setProfile(null);
        setError(null);
        setLoading(false);
        return null;
      }

      if (inFlightProfileRef.current && !options?.force) {
        return inFlightProfileRef.current;
      }

      const shouldShowLoading =
        !options?.silent && !hasResolvedInitialRef.current;
      if (shouldShowLoading) {
        setLoading(true);
      }

      const runTask = async (): Promise<UserProfile | null> => {
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (!session) {
            if (activeUserIdRef.current !== null) {
              clearAllHubCaches();
              activeUserIdRef.current = null;
            }
            setProfile(null);
            setError(null);
            return null;
          }

          if (
            activeUserIdRef.current &&
            activeUserIdRef.current !== session.user.id
          ) {
            clearAllHubCaches();
          }

          const next = await fetchProfile();
          activeUserIdRef.current = next.id;
          setProfile(next);
          setError(null);
          return next;
        } catch (err) {
          if (err instanceof ApiClientError && err.status === 401) {
            if (activeUserIdRef.current !== null) {
              clearAllHubCaches();
              activeUserIdRef.current = null;
            }
            setProfile(null);
            setError(null);
            return null;
          }
          // Preserve loaded profile during silent background errors; surface on foreground check
          if (!options?.silent || !activeUserIdRef.current) {
            setProfile(null);
            setError(formatApiErrorMessage(err));
          }
          return null;
        } finally {
          hasResolvedInitialRef.current = true;
          setLoading(false);
          if (inFlightProfileRef.current === task) {
            inFlightProfileRef.current = null;
          }
        }
      };

      const task = runTask();
      inFlightProfileRef.current = task;
      return task;
    },
    []
  );

  useEffect(() => {
    void refreshProfile();

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        if (activeUserIdRef.current !== null) {
          clearAllHubCaches();
          activeUserIdRef.current = null;
        }
        hasResolvedInitialRef.current = true;
        setProfile(null);
        setError(null);
        setLoading(false);
        return;
      }

      const sessionUserId = session.user.id;
      // Browser tab focus / visibilitychange triggers TOKEN_REFRESHED / INITIAL_SESSION / SIGNED_IN
      // for the same already-loaded user. Never unmount the portal or re-trigger skeletons.
      if (
        hasResolvedInitialRef.current &&
        activeUserIdRef.current === sessionUserId
      ) {
        return;
      }

      void refreshProfile({ silent: hasResolvedInitialRef.current });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [refreshProfile]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<UserProfile> => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        throw new Error(
          "Supabase authentication is not configured in this environment."
        );
      }

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        throw new Error(authError.message);
      }

      if (
        activeUserIdRef.current &&
        data.user?.id &&
        activeUserIdRef.current !== data.user.id
      ) {
        clearAllHubCaches();
      }

      const loaded = await refreshProfile({ silent: true, force: true });
      if (!loaded) {
        throw new Error(
          "Signed in, but your GRIT profile could not be loaded. Please try again."
        );
      }
      return loaded;
    },
    [refreshProfile]
  );

  const signOut = useCallback(async (): Promise<void> => {
    clearAllHubCaches();
    activeUserIdRef.current = null;
    inFlightProfileRef.current = null;

    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    setProfile(null);
    setError(null);
    setLoading(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        profile,
        loading,
        error,
        supabaseConfigured,
        refreshProfile,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
