import { PrimaryGoal } from '../types';
import { IconName } from '../components/ui/Icon';

// Shown at onboarding and editable later in Settings — one definition so
// the two screens can never offer different options or drift out of sync.
// Only goals the app can genuinely act on today are listed (see
// dashboardPriorities.ts's GOAL_KINDS and actionRecommendationEngine.ts's
// preferredImpactType) -- "save time" or "manage employees" would be
// exactly the fake personalization this app avoids elsewhere, since
// there's no real data behind either of those yet.
export const PRIMARY_GOAL_OPTIONS: { value: PrimaryGoal | null; label: string; icon: IconName }[] = [
    { value: 'cashflow',  label: 'Cash flow',              icon: 'droplet' },
    { value: 'costs',     label: 'Cutting costs',          icon: 'scissors' },
    { value: 'financing', label: 'Getting financing-ready', icon: 'credit-card' },
    { value: null,        label: 'Not sure yet',           icon: 'help-circle' },
];
