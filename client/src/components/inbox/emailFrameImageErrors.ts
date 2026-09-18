export type EmailFrameImage = Pick<
  HTMLImageElement,
  "complete" | "naturalWidth" | "addEventListener" | "removeEventListener"
>;

/**
 * Observe image failures without iframe scripts. Images may have completed
 * before the iframe load event; a completed image with no intrinsic width is
 * already broken. Images still loading (including lazy images) retain an error
 * listener. The caller owns deduplication across repeated document processing.
 */
export function observeEmailFrameImageFailures(
  images: Iterable<EmailFrameImage>,
  onImageError: () => void,
): () => void {
  const pending: EmailFrameImage[] = [];
  let reported = false;
  const reportOnce = () => {
    if (reported) return;
    reported = true;
    onImageError();
  };

  for (const img of images) {
    if (img.complete) {
      if (img.naturalWidth <= 0) reportOnce();
      continue;
    }
    img.addEventListener("error", reportOnce, { once: true });
    pending.push(img);
  }

  return () => {
    for (const img of pending) img.removeEventListener("error", reportOnce);
  };
}
