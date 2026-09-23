import { useEffect, useMemo, useState } from 'react';
import { Provider } from 'react-redux';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { createPortalStore } from './store';
import { LoginPage } from './LoginPage';
import { LoggedOutPage } from './LoggedOutPage';
import { DashboardLayout } from './Layout';
import { DidListPage } from './pages/dids/DidListPage';
import { DidCreatePage } from './pages/dids/DidCreatePage';
import { DidResolvePage } from './pages/dids/DidResolvePage';
import { DidUpdatePage } from './pages/dids/DidUpdatePage';
import { SchemaListPage } from './pages/schemas/SchemaListPage';
import { SchemaCreatePage } from './pages/schemas/SchemaCreatePage';
import { SchemaDetailPage } from './pages/schemas/SchemaDetailPage';
import { OfferListPage } from './pages/offers/OfferListPage';
import { OfferCreatePage } from './pages/offers/OfferCreatePage';
import { OfferDetailPage } from './pages/offers/OfferDetailPage';
import { InvitationsPage } from './pages/InvitationsPage';
import { CredentialsPage } from './pages/CredentialsPage';

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

/** Only allow same-origin relative paths as a redirect target. */
function safeReturnTo(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/';
}

function LoadingScreen() {
  return <main className="min-h-screen bg-panel" aria-busy="true" />;
}

function AppRoutes() {
  const session = useSession();
  const location = useLocation();

  const isLoginRoute = location.pathname === '/login';
  const isLoggedOutRoute = location.pathname === '/logged-out';

  useEffect(() => {
    if (session.status === 'loading') {
      return;
    }

    if (session.status === 'authenticated') {
      // Logged-in users shouldn't sit on the login page; send them to returnTo.
      if (isLoginRoute) {
        const returnTo = new URLSearchParams(location.search).get('returnTo');
        window.location.assign(safeReturnTo(returnTo));
      }
      return;
    }

    // Unauthenticated on a protected route: enforce the login redirect. The
    // gateway already does this for fresh loads; this covers sessions that
    // expire while the SPA is open.
    if (!isLoginRoute && !isLoggedOutRoute) {
      const target = `${location.pathname}${location.search}`;
      window.location.assign(`/login?returnTo=${encodeURIComponent(target)}`);
    }
  }, [session.status, isLoginRoute, isLoggedOutRoute, location]);

  return (
    <Routes>
      <Route path="/logged-out" element={<LoggedOutPage />} />
      <Route
        path="/login"
        element={
          // Render the form only once we know the visitor is unauthenticated;
          // otherwise show a neutral screen while loading or while redirecting
          // an authed user.
          session.status === 'unauthenticated' ? <LoginPage /> : <LoadingScreen />
        }
      />
      {session.status === 'authenticated' ? (
        <Route element={<DashboardLayout user={session.user} />}>
          <Route index element={<Navigate to="/dids" replace />} />
          <Route path="/dids" element={<DidListPage />} />
          <Route path="/dids/new" element={<DidCreatePage />} />
          <Route path="/dids/resolve" element={<DidResolvePage />} />
          <Route path="/dids/:did/update" element={<DidUpdatePage />} />
          <Route path="/issuer/schemas" element={<SchemaListPage />} />
          <Route path="/issuer/schemas/new" element={<SchemaCreatePage />} />
          <Route path="/issuer/schemas/:uuid" element={<SchemaDetailPage />} />
          <Route path="/issuer/offers" element={<OfferListPage />} />
          <Route path="/issuer/offers/new" element={<OfferCreatePage />} />
          <Route path="/issuer/offers/:recordId" element={<OfferDetailPage />} />
          <Route path="/holder/invitations" element={<InvitationsPage />} />
          <Route path="/holder/credentials" element={<CredentialsPage />} />
          {/* An address that matches nothing goes to the DID area, the front page. */}
          <Route path="*" element={<Navigate to="/dids" replace />} />
        </Route>
      ) : (
        // Loading, or unauthenticated and being redirected to /login.
        <Route path="*" element={<LoadingScreen />} />
      )}
    </Routes>
  );
}

export function App() {
  const store = useMemo(() => createPortalStore(), []);

  return (
    <Provider store={store}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </Provider>
  );
}
