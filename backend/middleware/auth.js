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
    // Supabase not configured — allow for local dev but warn loudly
    console.warn('[AUTH] Supabase not configured — auth bypassed. Set SUPABASE_URL and SUPABASE_SERVICE_KEY.');
    req.userId = req.body?.userId || req.params?.userId || null;
    return next();
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
