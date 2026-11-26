const DEVICE_KEY = 'salbarkain:deviceToken';
const GUEST_KEY = 'salbarkain_guest';

function readGuest() {
  try {
    const current = JSON.parse(localStorage.getItem(GUEST_KEY) || 'null');
    if (current && typeof current === 'object') return current;
    // Migrate profiles saved by earlier builds without discarding a buyer's details.
    const legacy = {
      name: localStorage.getItem('salbarkain:buyerName') || '',
      phone: localStorage.getItem('salbarkain:buyerPhone') || '',
    };
    return legacy.name || legacy.phone ? legacy : {};
  } catch { return {}; }
}

export function getGuestProfile() {
  const guest = readGuest();
  return { name: typeof guest.name === 'string' ? guest.name : '', phone: typeof guest.phone === 'string' ? guest.phone : '' };
}

export function saveGuestProfile({ name, phone }) {
  const guest = { ...readGuest(), name: String(name || '').trim(), phone: String(phone || '').trim(), deviceToken: getDeviceToken() };
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(guest));
    // Keep legacy keys synchronized for versions already open in another tab.
    localStorage.setItem('salbarkain:buyerName', guest.name);
    localStorage.setItem('salbarkain:buyerPhone', guest.phone);
  } catch { /* The form still works for this reservation if storage is unavailable. */ }
  return guest;
}

export function getDeviceToken() {
  try {
    let value = localStorage.getItem(DEVICE_KEY);
    if (!value || !/^[a-zA-Z0-9-]{16,100}$/.test(value)) {
      value = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, value);
    }
    const guest = readGuest();
    if (guest.deviceToken !== value) localStorage.setItem(GUEST_KEY, JSON.stringify({ ...guest, deviceToken: value }));
    return value;
  } catch { return crypto.randomUUID(); }
}
