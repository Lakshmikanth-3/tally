import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import Nav from './Nav';

// Medium-weight sans throughout — no display/pixel face in this theme, the
// coin video itself carries the visual interest now (framed in the hero,
// not a full-bleed background).
const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Tally — revenue becomes a bond',
  description: "A shop's verified revenue becomes a short bond. Underwritten in private, priced in public, settles itself.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body>
        <Nav />
        {children}
        <footer className="site-footer">
          <p>Tally — built for ETHOnline 2026 · Hedera · Chainlink · The Graph</p>
          <p>Every figure on this site is a real query against real testnet infrastructure.</p>
        </footer>
      </body>
    </html>
  );
}
