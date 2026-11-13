"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PublicSupabaseConfig {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

let cachedClient: SupabaseClient | null | undefined;
let runtimeConfig: PublicSupabaseConfig = {};

function isPlaceholderValue(value: string | undefined): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  return (
    normalized.includes("your-project.supabase.co") ||
    normalized.includes("your-anon-key") ||
    normalized.includes("placeholder") ||
    normalized === "example"
  );
}

function resolveSupabaseEnv(): { url: string; anonKey: string } {
  const url =
    runtimeConfig.supabaseUrl?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    "";
  const anonKey =
    runtimeConfig.supabaseAnonKey?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    "";
  return { url, anonKey };
}

export function setRuntimeSupabaseConfig(config?: PublicSupabaseConfig): void {
  if (!config) return;
  const nextUrl = config.supabaseUrl?.trim() ?? "";
  const nextKey = config.supabaseAnonKey?.trim() ?? "";
  if (
    nextUrl === (runtimeConfig.supabaseUrl ?? "") &&
    nextKey === (runtimeConfig.supabaseAnonKey ?? "")
  ) {
    return;
  }
  runtimeConfig = {
    supabaseUrl: nextUrl || undefined,
    supabaseAnonKey: nextKey || undefined,
  };
  cachedClient = undefined;
}

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = resolveSupabaseEnv();
  if (isPlaceholderValue(url) || isPlaceholderValue(anonKey)) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    cachedClient = null;
    return null;
  }

  if (cachedClient !== undefined) {
    return cachedClient;
  }

  const { url, anonKey } = resolveSupabaseEnv();
  cachedClient = createBrowserClient(url, anonKey);
  return cachedClient;
}
