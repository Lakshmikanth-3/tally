import type { Metadata } from 'next';
import './globals.css';
import Nav from './Nav';
import VideoBackground from './VideoBackground';

export const metadata: Metadata = {
  title: 'Tally — revenue becomes a bond',
  description: "A shop's verified revenue becomes a short bond. Underwritten in private, priced in public, settles itself.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <VideoBackground />
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
