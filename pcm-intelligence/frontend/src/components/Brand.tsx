export function Brand({
  compact = false,
  light = false,
}: {
  compact?: boolean;
  light?: boolean;
}) {
  return (
    <span className={"brand-lockup" + (light ? " on-dark" : "")}>
      <span className="brand-symbol">
        <img src="/brand/pcm-mark.png" width="40" height="40" alt="" />
      </span>
      {!compact && (
        <span className="brand-wordmark">
          <b>PCM</b>
          <span>Intelligence</span>
        </span>
      )}
    </span>
  );
}
