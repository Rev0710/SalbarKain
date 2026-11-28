/** Return null for image links that only exist on the developer's machine. */
export function safeImageUrl(value) {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  if (!url) return null;
  if (/^data:image\/(?:jpeg|png|webp);base64,[a-z\d+/]+=*$/i.test(url)) return url;
  if (/^blob:https?:\/\//i.test(url)) return url;
  if (/^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(?:\/|$)/i.test(url)) return null;
  if (url.startsWith('/')) return url;
  return /^https?:\/\//i.test(url) ? url : null;
}
