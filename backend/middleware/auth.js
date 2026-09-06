const { createClient } = require('@supabase/supabase-js');

const supabaseUrl  = process.env.SUPABASE_URL;
const supabaseKey  = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

let supabase = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
}

/**
 * Verify the Supabase JWT from Authorization: Bearer <token>
 * Attaches req.userId and req.userEmail if valid.
 * Returns 401 if missing or invalid.
 */
async function requireAuth(req, res, next) {
  if (!supabase) {
    // Supabase not configured — fail closed. A prior version of this
    // branch bypassed auth entirely and trusted req.body.userId, which
    // meant any misconfigured/redeployed instance (missing env var) let
    // any caller impersonate any user on every protected route.
    console.error('[AUTH] Supabase not configured — rejecting request. Set SUPABASE_URL and SUPABASE_SERVICE_KEY.');
    return res.status(503).json({ error: 'Service unavailable' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.slice(7);
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.userId    = data.user.id;
    req.userEmail = data.user.email;
    next();
  } catch (err) {
    console.error('[AUTH] Token verification failed:', err.message);
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

module.exports = { requireAuth };
