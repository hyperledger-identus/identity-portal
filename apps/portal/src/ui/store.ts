import { configureStore, createSlice } from "@reduxjs/toolkit";

const runtimeSlice = createSlice({
  name: "runtime",
  initialState: {
    initialized: false,
  },
  reducers: {
    markInitialized(state) {
      state.initialized = true;
    },
  },
});

export const runtimeActions = runtimeSlice.actions;

export function createPortalStore() {
  return configureStore({
    reducer: {
      runtime: runtimeSlice.reducer,
    },
  });
}

export type PortalStore = ReturnType<typeof createPortalStore>;
export type RootState = ReturnType<PortalStore["getState"]>;
export type AppDispatch = PortalStore["dispatch"];
