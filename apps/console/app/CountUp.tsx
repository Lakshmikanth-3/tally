'use client';

import { useEffect, useRef, useState } from 'react';

/// Animates from 0 up to a real, already-fetched number — never a
/// placeholder. Purely a presentation effect; the value itself always
/// comes from the server-rendered parent.
export default function CountUp({ value, prefix = '', suffix = '', durationMs = 900 }: { value: number; prefix?: string; suffix?: string; durationMs?: number }) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    let frame: number;
    function tick(timestamp: number) {
      if (startRef.current === null) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return (
    <>
      {prefix}
      {display.toLocaleString('en-US')}
      {suffix}
    </>
  );
}
