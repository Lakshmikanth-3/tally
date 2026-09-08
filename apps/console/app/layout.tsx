import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tally',
  description: "A shop's verified revenue becomes a short bond.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
