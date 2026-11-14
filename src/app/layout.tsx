import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { Providers } from "@frontend/components/Providers";
import "@frontend/styles/globals.css";

export const dynamic = "force-dynamic";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "GRIT Interview Hub — Skill Assessment & Certification Platform",
  description:
    "Precision interview scheduling, structured live evaluation, badge certification, and integrity governance for GRIT.",
  openGraph: {
    title: "GRIT Interview Hub",
    description:
      "Precision interview scheduling, structured live evaluation, badge certification, and integrity governance for GRIT.",
    type: "website",
  },
};

const themeInitScript = `(function(){try{var k='grit-theme';var m=localStorage.getItem(k)||'system';var d=m==='dark'||(m==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}else{document.documentElement.classList.remove('dark');document.documentElement.style.colorScheme='light';}}catch(e){if(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.classList.add('dark');}}})();`;

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
    <html
      lang="en"
      className={`${plusJakarta.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <Providers publicConfig={publicConfig}>{children}</Providers>
      </body>
    </html>
  );
}
