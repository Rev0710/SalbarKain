const DEVICE_KEY = 'salbarkain:deviceToken';

export function getDeviceToken() {
  let value = localStorage.getItem(DEVICE_KEY);
  if (!value || !/^[a-zA-Z0-9-]{16,100}$/.test(value)) {
    value = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, value);
  }
  return value;
}
