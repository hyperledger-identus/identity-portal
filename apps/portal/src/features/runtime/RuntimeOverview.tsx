import { useMemo } from "react";
import { detectRuntimeMode } from "@identity-portal/ssi-core";

const statusItems = [
  "DID lifecycle",
  "Connections",
  "Credentials",
  "Issuance",
  "Verification",
  "Mediator",
  "PRISM publishing",
];

export function RuntimeOverview() {
  const mode = useMemo(
    () =>
      detectRuntimeMode({
        cloudAgentApiEndpoint: import.meta.env.VITE_CLOUD_AGENT_API_ENDPOINT,
      }),
    [],
  );

  return (
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
        <div className="w-full border border-line bg-panel px-4 py-3 md:w-72">
          <p className="text-sm font-medium text-slate-600">Runtime mode</p>
          <p className="mt-1 text-xl font-semibold text-ink">{mode.label}</p>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        {statusItems.map((item) => (
          <div key={item} className="border border-line bg-white p-4">
            <p className="text-sm font-medium text-slate-500">Planned module</p>
            <h2 className="mt-2 text-lg font-semibold text-ink">{item}</h2>
          </div>
        ))}
      </section>
    </div>
  );
}
