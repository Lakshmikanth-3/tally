import Link from 'next/link';

export default function Nav() {
  return (
    <nav className="nav">
      <Link href="/" className="nav-brand">
        <span className="brand-mark">T</span>
        Tally
      </Link>
      <div className="nav-links">
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/market">Market</Link>
        <Link href="/register-lookup">Repayment register</Link>
        <Link href="/proof">Verify on-chain</Link>
        <Link href="/register">Add a business</Link>
      </div>
    </nav>
  );
}
