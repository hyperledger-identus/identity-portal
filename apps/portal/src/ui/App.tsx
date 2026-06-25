import { useMemo } from "react";
import { Provider } from "react-redux";
import { createPortalStore } from "./store";

export function App() {
  const store = useMemo(() => createPortalStore(), []);

  return (
    <Provider store={store}>
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
            A reference dashboard for offline-first Edge Agent workflows and optional
            Cloud Agent operation.
          </p>
        </div>
      </header>
    </div>
      </main>
    </Provider>
  );
}
