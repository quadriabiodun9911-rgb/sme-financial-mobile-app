-- Quad360-maintained reference figures for the three MacroDrivers that
-- macro-feed's own research (see supabase/functions/macro-feed/index.ts)
-- found have no free live-data API: energy (fuel/diesel), interestRate
-- (borrowing cost), and inflation -- unlike fx, which already gets a real
-- live rate from macro-feed. Most SME owners don't track CBN's policy rate
-- or NBS's headline inflation print themselves; this lets Quad360 give
-- them a concrete, dated anchor instead of "ask your bank."
--
-- `change_pct` is ALWAYS a % change over `period_months`, the same
-- semantic as MacroAssumption.changePct/periodMonths (never a raw rate
-- level) -- e.g. for interestRate, report how much a representative SME
-- borrowing rate has moved recently, not the raw CBN MPR; for inflation,
-- NBS's own headline YoY % change already is exactly this shape
-- (period_months = 12).
--
-- There is no in-app admin screen for this on purpose -- these are a
-- handful of figures updated occasionally (whenever CBN/NBS publishes a
-- new rate), not a feature that justifies its own admin role/auth system.
-- Update directly from the Supabase dashboard:
--   Table Editor -> admin_macro_rates -> edit or insert a row, or
--   SQL Editor -> UPDATE admin_macro_rates SET change_pct = ..., period_months = ..., source = ..., as_of = CURRENT_DATE WHERE driver = '...';
CREATE TABLE IF NOT EXISTS admin_macro_rates (
    driver         TEXT PRIMARY KEY CHECK (driver IN ('energy', 'interestRate', 'inflation')),
    label          TEXT NOT NULL,
    change_pct     DECIMAL(6, 2) NOT NULL,
    period_months  INTEGER NOT NULL CHECK (period_months > 0),
    source         TEXT NOT NULL,
    note           TEXT,
    as_of          DATE NOT NULL,
    updated_at     TIMESTAMP DEFAULT NOW()
);

ALTER TABLE admin_macro_rates ENABLE ROW LEVEL SECURITY;

-- Every signed-in business can read these -- they're a shared, app-wide
-- reference, not business-specific data. No INSERT/UPDATE/DELETE policy:
-- only the service role (the Supabase dashboard) can write this table: it
-- is never writable from the mobile app.
CREATE POLICY "authenticated users can read admin macro rates"
    ON admin_macro_rates FOR SELECT
    TO authenticated
    USING (true);
