import { z } from "zod";
import { AppError } from "@backend/lib/errors";

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  EMAIL_PROVIDER_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().email().optional(),
});

export type AppConfig = z.infer<typeof schema>;

export function getConfig(): AppConfig {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new AppError(
      "SUPABASE_NOT_CONFIGURED",
      503,
      "Supabase environment variables are not configured in this environment."
    );
  }
  return parsed.data;
}
