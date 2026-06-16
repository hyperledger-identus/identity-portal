import { useMemo } from "react";
import { Provider } from "react-redux";
import { createPortalStore } from "./store";
import { RuntimeOverview } from "./features/runtime/RuntimeOverview";

export function App() {
  const store = useMemo(() => createPortalStore(), []);

  return (
    <Provider store={store}>
      <main className="min-h-screen bg-white text-ink">
        <RuntimeOverview />
      </main>
    </Provider>
  );
}
