const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function apiFetch(path, options = {}, attempt = 1) {
  const method = (options.method || 'GET').toUpperCase();
  const token = localStorage.getItem('token');

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    // Network-level failure: the backend is asleep/starting up or the
    // connection dropped. GETs are safe to retry automatically — by the time
    // a cold-started server wakes up (usually ~10–30s on free hosting), the
    // request goes through instead of the user seeing "Failed to fetch".
    // Mutating calls (POST/PUT/DELETE) are NOT retried since replaying them
    // could record a sale or payment twice.
    if (method === 'GET' && attempt <= 4) {
      await sleep(attempt * 2000); // waits 2s, 4s, 6s, 8s ≈ 20s of patience
      return apiFetch(path, options, attempt + 1);
    }
    throw new Error('Cannot reach the server. Please try again in a moment.');
  }

  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('Session expired, please log in again');
  }

  return res;
}
