import type { Metadata } from "next";
import { Providers } from "@frontend/components/Providers";
import "@frontend/styles/globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "GRIT Interview Hub",
  description:
    "Interview scheduling, evaluation, badge certification, and integrity review platform for GRIT.",
};

const themeInitScript = `(function(){try{var k='grit-theme';var m=localStorage.getItem(k)||'system';var d=m==='dark'||(m==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}else{document.documentElement.classList.remove('dark');document.documentElement.style.colorScheme='light';}}catch(e){}})();`;

function readServerPublicConfig() {
  const env = process.env;
  const urlKey = "NEXT_PUBLIC_SUPABASE_URL";
  const anonKeyName = "NEXT_PUBLIC_SUPABASE_ANON_KEY";
  return {
    supabaseUrl: env[urlKey] ?? "",
    supabaseAnonKey: env[anonKeyName] ?? "",
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const publicConfig = readServerPublicConfig();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <Providers publicConfig={publicConfig}>{children}</Providers>
      </body>
    </html>
  );
}
