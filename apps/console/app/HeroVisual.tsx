/// The rotating Tally coin, framed inside the hero as a contained card —
/// not a full-page background. A dark full-bleed video doesn't sit well
/// under a white/light-blue theme, so it lives inside its own rounded,
/// shadowed frame instead, the way a 3D asset preview sits in a dashboard
/// mockup card.
///
/// `muted` + `playsInline` are not stylistic: every browser blocks
/// autoplay for a video with audio, so without `muted` this silently
/// never starts. The poster frame covers the first paint so there's no
/// flash before the first video frame decodes.
export default function HeroVisual() {
  return (
    <div className="hero-visual-wrap">
      <div className="hero-visual-glow" aria-hidden="true" />
      <div className="hero-visual">
        <video autoPlay loop muted playsInline preload="auto" poster="/media/tally-coin-poster.jpg">
          <source src="/media/tally-coin.mp4" type="video/mp4" />
        </video>
        <div className="hero-visual-chip">
          <span>Tally Bond</span>
          <span>Hedera Testnet</span>
        </div>
      </div>
    </div>
  );
}
