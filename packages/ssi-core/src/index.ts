export type RuntimeMode = "edge-agent" | "cloud-agent";

export type RuntimeConfig = {
  cloudAgentApiEndpoint?: string;
  mediatorDid?: string;
  prismResolverUrl?: string;
  neoprismNodeUrl?: string;
};

export type RuntimeModeDescriptor = {
  mode: RuntimeMode;
  label: string;
  requiresBackend: boolean;
};

export function detectRuntimeMode(config: RuntimeConfig): RuntimeModeDescriptor {
  const endpoint = config.cloudAgentApiEndpoint?.trim();

  if (endpoint) {
    return {
      mode: "cloud-agent",
      label: "Connected Cloud Agent",
      requiresBackend: true,
    };
  }

  return {
    mode: "edge-agent",
    label: "Offline-first Edge Agent",
    requiresBackend: false,
  };
}

export type DIDLifecycleAction =
  | "create"
  | "resolve"
  | "update"
  | "publish"
  | "deactivate";

export type PortalWorkflow =
  | "did-management"
  | "connections"
  | "credentials"
  | "issuance"
  | "verification"
  | "messages";
