import type { Metadata } from "next";

export const metadata: Metadata = { title: "GRIT Interview Hub API", description: "Backend foundation" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
