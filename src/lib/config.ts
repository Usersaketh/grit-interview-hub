import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  EMAIL_PROVIDER_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().email().optional()
});
export type AppConfig = z.infer<typeof schema>;
export function getConfig(): AppConfig { return schema.parse(process.env); }
