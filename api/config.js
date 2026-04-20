// Tiny runtime-config endpoint. Exposes the public Supabase URL + anon key
// so the static frontend can init the SDK without a build step.
// Both values are public by design — Row Level Security is what protects
// user data, not key secrecy. The service-role key is never sent here.

module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Normalise the URL — a common footgun is setting SUPABASE_URL without the
  // scheme, which causes the client SDK to treat it as a relative path and
  // hit our own origin. Prepending https:// if missing saves a support
  // ticket per teacher.
  let url = (process.env.SUPABASE_URL || '').trim();
  if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
  // Strip any trailing slash so the SDK's URL construction is predictable.
  url = url.replace(/\/+$/, '');
  res.status(200).json({
    supabaseUrl: url,
    supabaseAnonKey: (process.env.SUPABASE_ANON_KEY || '').trim(),
    // For client-side diagnostics — doesn't leak anything that isn't public.
    configured: !!(url && process.env.SUPABASE_ANON_KEY),
  });
};
