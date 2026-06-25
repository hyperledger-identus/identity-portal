import path from "node:path";
import fs from "node:fs/promises";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import type { ViteDevServer } from "vite";
import { IS_PRODUCTION, UI_DIST, VITE_CONFIG } from "../config";


export type UiHandle = {
  close: () => Promise<void>;
};

export async function createUIRouter(app: Express): Promise<UiHandle> {
  return IS_PRODUCTION ? attachStaticUi(app) : attachViteDevUi(app);
}

async function attachViteDevUi(app: Express): Promise<UiHandle> {
  const { createServer } = await import("vite");

  const vite: ViteDevServer = await createServer({
    configFile: VITE_CONFIG,
    // In middleware mode Vite does not serve index.html itself, so we handle
    // the SPA HTML response manually below.
    appType: "custom",
    server: { middlewareMode: true },
  });

  app.use(vite.middlewares);

  // SPA fallback: serve the Vite-transformed index.html for any GET navigation
  // request that wasn't handled by Vite's asset/HMR middlewares above.
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET") {
      return next();
    }

    try {
      const templatePath = path.join(vite.config.root, "index.html");
      const template = await fs.readFile(templatePath, "utf-8");
      const html = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (err) {
      vite.ssrFixStacktrace(err as Error);
      next(err);
    }
  });

  return { close: () => vite.close() };
}

async function attachStaticUi(app: Express): Promise<UiHandle> {
  app.use(express.static(UI_DIST));

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) {
      return next();
    }
    res.sendFile(path.join(UI_DIST, "index.html"));
  });

  return { close: async () => undefined };
}
