import { useEffect, useState, type FormEvent } from "react";

type Providers = { google: boolean; github: boolean };

/** Same-origin relative path the user should land on after signing in. */
function getReturnTo(): string {
  const value = new URLSearchParams(window.location.search).get("returnTo");
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.24 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5A12 12 0 0 0 8.21 23.9c.6.11.82-.26.82-.58v-2.2c-3.34.72-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.1-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.11-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.58A12 12 0 0 0 12 .5Z" />
    </svg>
  );
}

/**
 * Branded login screen. Native username/password posts to the BFF (`POST
 * /api/auth/login`, ROPC); social buttons redirect into the Keycloak-brokered
 * code flow. Buttons are only shown for providers the server reports as enabled.
 */
export function LoginPage() {
  const [username, setUsername] = useState("alice");
  const [password, setPassword] = useState("1234");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [providers, setProviders] = useState<Providers>({ google: false, github: false });

  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("error");
    if (reason === "session_expired") {
      setError("Your sign-in session expired. Please try again.");
    } else if (reason === "login_failed") {
      setError("Sign-in failed. Please try again.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/providers", {
          headers: { Accept: "application/json" },
        });
        if (!res.ok || cancelled) return;
        const body = await res.json();
        if (!cancelled && body?.providers) {
          setProviders({
            google: Boolean(body.providers.google),
            github: Boolean(body.providers.github),
          });
        }
      } catch {
        /* providers stay disabled */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });
      const body = await res.json().catch(() => ({}));

      if (res.ok && body?.success) {
        window.location.assign(getReturnTo());
        return;
      }
      if (res.status === 409 && body?.requiresRedirect && typeof body?.loginUrl === "string") {
        window.location.assign(body.loginUrl);
        return;
      }
      setError(body?.error ?? "Unable to sign in. Please try again.");
    } catch {
      setError("Unable to reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const hasSocial = providers.google || providers.github;
  const returnToParam = `?returnTo=${encodeURIComponent(getReturnTo())}`;

  return (
    <main className="flex min-h-screen items-center justify-center bg-panel px-4 py-12 text-ink">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="text-sm font-medium uppercase tracking-wide text-brand">
            Hyperledger Identus
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">
            Identity Portal
          </h1>
          <p className="mt-2 text-sm text-slate-600">Sign in to continue.</p>
        </div>

        <div className="rounded-2xl border border-line bg-white p-8 shadow-sm">
          {error && (
            <div
              role="alert"
              className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              Username
              <input
                type="text"
                name="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                className="rounded-md border border-line bg-white px-3 py-2 text-base font-normal text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              Password
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="rounded-md border border-line bg-white px-3 py-2 text-base font-normal text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {hasSocial && (
            <>
              <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wide text-slate-400">
                <span className="h-px flex-1 bg-line" />
                or
                <span className="h-px flex-1 bg-line" />
              </div>

              <div className="flex flex-col gap-3">
                {providers.google && (
                  <a
                    href={`/auth/google${returnToParam}`}
                    className="flex items-center justify-center gap-3 rounded-md border border-line bg-white px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-panel"
                  >
                    <GoogleIcon />
                    Continue with Google
                  </a>
                )}
                {providers.github && (
                  <a
                    href={`/auth/github${returnToParam}`}
                    className="flex items-center justify-center gap-3 rounded-md border border-line bg-[#24292f] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#24292f]/90"
                  >
                    <GitHubIcon />
                    Continue with GitHub
                  </a>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
