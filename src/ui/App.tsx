import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { createPortalStore } from './store';
import { LoginPage } from './LoginPage';
import { LoggedOutPage } from './LoggedOutPage';
import { DidResolver } from './DidResolver';

type SessionUser = {
  sub?: string;
  username?: string;
  email?: string;
  name?: string;
};

type SessionState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: SessionUser }
  | { status: 'unauthenticated' };

/**
 * Reads the current session from the BFF gateway (`GET /api/auth/me`). The
 * branded login page lives at the `/login` route; unauthenticated visitors are
 * redirected there (server-side by the gateway, and client-side here as a
 * fallback for sessions that expire while the app is open).
 */
function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/auth/me', {
          headers: { Accept: 'application/json' },
          credentials: 'include',
        });
        if (cancelled) return;

        if (res.status === 401) {
          setState({ status: 'unauthenticated' });
          return;
        }

        const body = await res.json();
        setState({ status: 'authenticated', user: body.user ?? {} });
      } catch {
        if (!cancelled) setState({ status: 'unauthenticated' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

function Dashboard({ user }: { user: SessionUser }) {
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
        <DidResolver />
      </div>
    </main>
  );
}

/** Only allow same-origin relative paths as a redirect target. */
function safeReturnTo(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/';
}

function LoadingScreen() {
  return <main className="min-h-screen bg-panel" aria-busy="true" />;
}

export function App() {
  const store = useMemo(() => createPortalStore(), []);
  const session = useSession();

  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  const isLoginRoute = path === '/login';
  const isLoggedOutRoute = path === '/logged-out';

  useEffect(() => {
    if (session.status === 'loading') {
      return;
    }

    if (session.status === 'authenticated') {
      // Logged-in users shouldn't sit on the login page; send them to returnTo.
      if (isLoginRoute) {
        const returnTo = new URLSearchParams(window.location.search).get(
          'returnTo',
        );
        window.location.assign(safeReturnTo(returnTo));
      }
      return;
    }

    // Unauthenticated on a protected route: enforce the login redirect. The
    // gateway already does this for fresh loads; this covers sessions that
    // expire while the SPA is open.
    if (!isLoginRoute && !isLoggedOutRoute) {
      const target = `${window.location.pathname}${window.location.search}`;
      window.location.assign(`/login?returnTo=${encodeURIComponent(target)}`);
    }
  }, [session.status, isLoginRoute, isLoggedOutRoute]);

  let content: ReactNode;
  if (isLoggedOutRoute) {
    content = <LoggedOutPage />;
  } else if (isLoginRoute) {
    // Render the form only once we know the visitor is unauthenticated; otherwise
    // show a neutral screen while loading or while redirecting an authed user.
    content =
      session.status === 'unauthenticated' ? <LoginPage /> : <LoadingScreen />;
  } else if (session.status === 'authenticated') {
    content = <Dashboard user={session.user} />;
  } else {
    // Loading, or unauthenticated and being redirected to /login.
    content = <LoadingScreen />;
  }

  return <Provider store={store}>{content}</Provider>;
}
