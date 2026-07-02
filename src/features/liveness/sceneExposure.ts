/**
 * Optional scene brightness gate. Mean luma should be in 0–1 (e.g. from a Vision Camera frame
 * processor sampling a downscaled ROI). Pass the value into `useLivenessGatekeeper({ sceneMeanLuma })`
 * when available; until then the gate is a no-op.
 */
const DARK_LUMA_THRESHOLD = 0.12;

export function exposureWouldBlock(meanLuma: number | undefined): boolean {
  if (meanLuma == null || Number.isNaN(meanLuma)) return false;
  return meanLuma < DARK_LUMA_THRESHOLD;
}
