import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import AppTools from "../src/components/AppTools";
import "./styles.css";
import "./v05.css";
import "./v06.css";

export const metadata: Metadata = {
  title: "Workout Tracker",
  description: "Fast personal lifting tracker",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  appleWebApp: {
    capable: true,
    title: "Workout Tracker",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#080808",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <AppTools />
      </body>
    </html>
  );
}
