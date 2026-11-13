"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { ApiClientError, formatApiErrorMessage } from "@frontend/services/apiClient";
import { fetchProfile } from "@frontend/services/hubApi";
import {
  getSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@frontend/services/supabaseBrowser";
import type { UserProfile } from "@frontend/types/api";

interface AuthContextValue {
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  supabaseConfigured: boolean;
  refreshProfile: () => Promise<UserProfile | null>;
  signIn: (email: string, password: string) => Promise<UserProfile>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const supabaseConfigured = isSupabaseConfigured();

  const refreshProfile = useCallback(async (): Promise<UserProfile | null> => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setProfile(null);
      setError(null);
      setLoading(false);
      return null;
    }

    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setProfile(null);
        setError(null);
        return null;
      }

      const next = await fetchProfile();
      setProfile(next);
      return next;
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        setProfile(null);
        setError(null);
        return null;
      }
      setProfile(null);
      setError(formatApiErrorMessage(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshProfile();

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event) => {
      void refreshProfile();
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

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        throw new Error(authError.message);
      }

      const loaded = await fetchProfile();
      setProfile(loaded);
      setError(null);
      return loaded;
    },
    []
  );

  const signOut = useCallback(async (): Promise<void> => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    setProfile(null);
    setError(null);
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
