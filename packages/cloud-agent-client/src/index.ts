export type CloudAgentClientConfig = {
  endpoint: string;
  fetch?: typeof fetch;
};

export type HealthResponse = {
  status: string;
};

export class CloudAgentClient {
  private readonly endpoint: string;
  private readonly fetchFn: typeof fetch;

  constructor(config: CloudAgentClientConfig) {
    this.endpoint = config.endpoint.replace(/\/$/, "");
    this.fetchFn = config.fetch ?? fetch;
  }

  async health(): Promise<HealthResponse> {
    const response = await this.fetchFn(`${this.endpoint}/_system/health`);

    if (!response.ok) {
      throw new Error(`Cloud Agent health check failed: ${response.status}`);
    }

    return (await response.json()) as HealthResponse;
  }
}
