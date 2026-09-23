import { NavLink, Outlet } from 'react-router-dom';

type SessionUser = {
  sub?: string;
  username?: string;
  email?: string;
  name?: string;
};

/** One sidebar group: a small caption and the links under it. */
type NavGroup = {
  label: string | null;
  links: Array<{ to: string; label: string }>;
};

/**
 * The menu mirrors the roles the portal serves: the DID area is shared, the
 * issuer manages schemas and offers, the holder accepts invitations and keeps
 * credentials. Phase 6 adds the verifier as one more group here.
 */
const NAV_GROUPS: NavGroup[] = [
  { label: null, links: [{ to: '/dids', label: 'DIDs' }] },
  {
    label: 'Issuer',
    links: [
      { to: '/issuer/schemas', label: 'Schemas' },
      { to: '/issuer/offers', label: 'Offers' },
    ],
  },
  {
    label: 'Holder',
    links: [
      { to: '/holder/invitations', label: 'Invitations' },
      { to: '/holder/credentials', label: 'Credentials' },
    ],
  },
];

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return [
    'block rounded-md px-3 py-2 text-sm font-medium transition',
    isActive ? 'bg-slate-900 text-white' : 'text-ink hover:bg-slate-50',
  ].join(' ');
}

/**
 * The frame every signed-in page shares: the portal header, the role menu and
 * the routed page content. The header is the one the single-page dashboard
 * carried; only the menu is new.
 */
export function DashboardLayout({ user }: { user: SessionUser }) {
  return (
    <main className="min-h-screen bg-white text-ink">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-6 py-6">
        <header className="flex flex-col gap-5 border-b border-line pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-brand">
              Hyperledger Identus
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal text-ink md:text-5xl">
              Identity Portal
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-700">
              A reference dashboard for offline-first Edge Agent workflows and
              optional Cloud Agent operation.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-700">
              Signed in as{' '}
              <span className="font-semibold text-ink">
                {user.username ?? user.email ?? 'user'}
              </span>
            </span>
            <a
              href="/auth/logout"
              className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-slate-50"
            >
              Log out
            </a>
          </div>
        </header>
        <div className="flex flex-col gap-8 md:flex-row">
          <nav
            aria-label="Portal sections"
            className="flex shrink-0 flex-row flex-wrap gap-4 md:w-48 md:flex-col"
          >
            {NAV_GROUPS.map((group) => (
              <div key={group.label ?? 'top'} className="flex min-w-32 flex-col gap-1">
                {group.label && (
                  <p className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    {group.label}
                  </p>
                )}
                {group.links.map((link) => (
                  <NavLink key={link.to} to={link.to} className={navLinkClass}>
                    {link.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div className="min-w-0 flex-1">
            <Outlet />
          </div>
        </div>
      </div>
    </main>
  );
}
