// ============================================================================
// COMPATIBILITY RE-EXPORT — the real implementation lives in OptimizedContexts
// ============================================================================
// This file used to hold a full, separate AppProvider/AuthProvider
// implementation. It was never mounted anywhere (App.tsx has always wired up
// the providers from OptimizedContexts directly), and every one of the ~50
// files that import from this module only ever pulled in `useApp` — so the
// rest of it was dead code. It's removed rather than kept around unused
// because it was a stale fork: it duplicated OptimizedContexts' auth logic
// (including the PIN-derived-password pattern fixed there) without ever
// receiving that fix, which is exactly how a resolved vulnerability survives
// in a codebase — in a copy nobody remembers is unreachable.
//
// Screens continue to `import { useApp } from '../contexts/AppContext'`
// unchanged; this just forwards to the one real implementation.
export { useApp } from './OptimizedContexts';
