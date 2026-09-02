import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import AppTools from "../src/components/AppTools";
import InteractionLayer from "../src/components/InteractionLayer";
import StorageGate from "../src/components/StorageGate";
import "./styles.css";
import "./v05.css";
import "./v06.css";
import "./v07.css";
import "./v08.css";
import "./v09.css";
import "./v10.css";
import "./v11.css";
import "./v12.css";
import "./v13.css";
import "./v14.css";
import "./v15.css";
import "./v16.css";
import "./v17.css";
import "./v18.css";
import "./v19.css";
import "./v20.css";
import "./v21.css";
import "./v22.css";

export const metadata: Metadata = { title: "Workout Tracker", description: "Adaptive hybrid training tracker with personalized load calibration and plan-vs-actual coaching", manifest: "/manifest.webmanifest", icons: { icon: "/icon.svg", apple: "/icon.svg" }, appleWebApp: { capable: true, title: "Workout Tracker", statusBarStyle: "black-translucent" } };
export const viewport: Viewport = { themeColor: "#080808" };
export default function RootLayout({ children }: { children: ReactNode }) { return <html lang="en"><body><StorageGate>{children}<AppTools/><InteractionLayer/></StorageGate></body></html>; }
