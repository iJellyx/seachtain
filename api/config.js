// Tiny runtime-config endpoint. Exposes the public Supabase URL + anon key
// so the static frontend can init the SDK without a build step.
// Both values are public by design — Row Level Security is what protects
// user data, not key secrecy. The service-role key is never sent here.

module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  });
};
