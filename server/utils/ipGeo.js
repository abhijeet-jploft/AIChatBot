const http = require('http');

/**
 * Extract the real client IP from an Express request.
 * Checks X-Forwarded-For, X-Real-IP, then falls back to socket address.
 */
function extractClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // First IP in the chain is the original client
    const first = String(forwarded).split(',')[0].trim();
    if (first) return first;
  }
  const realIp = req.headers['x-real-ip'];
  if (realIp) return String(realIp).trim();
  const remoteAddr = req.socket?.remoteAddress || req.connection?.remoteAddress || '';
  // Strip IPv6 prefix for IPv4-mapped addresses (::ffff:1.2.3.4)
  return remoteAddr.replace(/^::ffff:/, '');
}

/**
 * Lightweight IP geo-lookup using ip-api.com (free, no key, 45 req/min).
 * Returns { country, cityState } or empty strings on failure.
 * Non-blocking, never throws.
 */
function lookupIpGeo(ip) {
  return new Promise((resolve) => {
    if (!ip || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|localhost)/.test(ip)) {
      return resolve({ country: '', cityState: '' });
    }

    const timeout = setTimeout(() => resolve({ country: '', cityState: '' }), 3000);

    const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city`;
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        clearTimeout(timeout);
        try {
          const json = JSON.parse(data);
          if (json.status === 'success') {
            const parts = [json.city, json.regionName].filter(Boolean);
            resolve({
              country: json.country || '',
              cityState: parts.join(', '),
            });
          } else {
            resolve({ country: '', cityState: '' });
          }
        } catch {
          resolve({ country: '', cityState: '' });
        }
      });
      res.on('error', () => {
        clearTimeout(timeout);
        resolve({ country: '', cityState: '' });
      });
    }).on('error', () => {
      clearTimeout(timeout);
      resolve({ country: '', cityState: '' });
    });
  });
}

module.exports = { extractClientIp, lookupIpGeo };
