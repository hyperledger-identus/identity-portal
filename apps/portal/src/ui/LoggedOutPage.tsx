/**
 * Branded landing shown after logout. Keycloak's end-session flow redirects here
 * (`post_logout_redirect_uri`), the session cookie is already cleared.
 */
export function LoggedOutPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-panel px-4 py-12 text-ink">
      <div className="w-full max-w-md text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-brand">
          Hyperledger Identus
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">
          You&apos;ve been signed out
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          Your session has ended. Thanks for using the Identity Portal.
        </p>
        <a
          href="/"
          className="mt-6 inline-block rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand/90"
        >
          Sign in again
        </a>
      </div>
    </main>
  );
}
