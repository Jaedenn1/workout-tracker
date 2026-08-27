import type { ReactNode } from "react";
import "./styles.css";

export const metadata = {
  title: "Workout Tracker",
  description: "Fast personal lifting tracker",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
