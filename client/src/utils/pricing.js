export function isFlashDropActive(batch, now = Date.now()) {
  if (!batch?.isFlashDropEnabled || !batch.expiresAt) return false;
  const remainingMs = new Date(batch.expiresAt).getTime() - new Date(now).getTime();
  return remainingMs >= 0 && remainingMs <= 30 * 60 * 1000;
}

export function getEffectiveUnitPrice(batch, now = Date.now(), { verifiedNgo = false } = {}) {
  if (!batch || batch.isDonationOnly || (verifiedNgo && isFlashDropActive(batch, now))) return 0;
  const price = Number(batch.price) || 0;
  return isFlashDropActive(batch, now) ? Number((price * 0.5).toFixed(2)) : price;
}
