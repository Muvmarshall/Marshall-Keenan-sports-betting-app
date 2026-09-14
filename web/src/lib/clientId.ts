const KEY = 'parlay.clientId';

/** Anonymous per-device id — no accounts, no auth, stored only in this browser. */
export function getClientId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return 'anonymous';
  }
}
