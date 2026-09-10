import Link from 'next/link';

export default function Nav() {
  return (
    <nav className="nav">
      <Link href="/" className="nav-brand">
        <span className="brand-mark" />
        Tally
      </Link>
      <div className="nav-links">
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/register">Register a business</Link>
      </div>
    </nav>
  );
}
