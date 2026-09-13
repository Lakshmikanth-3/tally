/// The rotating Tally coin, looping forever behind every page.
///
/// `muted` + `playsInline` are not stylistic: every browser blocks
/// autoplay for a video with audio, so without `muted` this silently
/// never starts. The poster frame covers the first paint so there's no
/// black flash before the first video frame decodes.
export default function VideoBackground() {
  return (
    <div className="video-bg" aria-hidden="true">
      {/* preload="metadata", not "auto": the clip is 3.6MB and sits behind
          every page, so "auto" made each navigation compete with the video
          for bandwidth. The poster (24KB) still covers first paint, so the
          page looks identical while the video streams in behind it. */}
      <video autoPlay loop muted playsInline preload="metadata" poster="/media/tally-coin-poster.jpg">
        <source src="/media/tally-coin.mp4" type="video/mp4" />
      </video>
      <div className="video-scrim" />
    </div>
  );
}
