export default function HomePage() {
  return (
    <main>
      <div className="brand">
        <span className="brand-mark" />
        <h1>Tally</h1>
      </div>
      <p>A shop's verified revenue becomes a short bond.</p>
      <section>
        <h2>Get started</h2>
        <p>Register a business to run underwriting against its real revenue and, if approved, issue a bond on Hedera testnet.</p>
        <a className="button-link" href="/register">
          Register your business
        </a>
      </section>
    </main>
  );
}
