export function formatTimeLeft(value) {
  const seconds = Math.max(0, Math.floor((new Date(value).getTime() - Date.now()) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function formatCutoff(value) {
  return new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}
