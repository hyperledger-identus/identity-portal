import express, { type Request, type Response, type NextFunction } from "express";
import cors from 'cors';
import { createAPIRouter } from "../api";
import { createRequestContext } from "../api/context";
import { PORT } from "../config";
import {  createUIRouter } from "./ui";
import { createProtectedAuthRouter, createPublicAuthRouter, guardUi, requireApiAuth } from "./auth";
import { type Server } from "node:http";

type Options = {
     onClose: () => Promise<void>,
}

export class HttpServer {
    private server!: Server;
    private uiClose?: () => Promise<void>;
    constructor(private readonly options: Options ) {}

    async start() {
        const app = express();

        app.use(cors());
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));

        // Each API request builds its own context (resolves the authenticated
        // agent for the caller), so the remote agent is always used as the user.
        const apiRouter = await createAPIRouter(createRequestContext);
        const uiRouter = await createUIRouter();

        // Public auth endpoints (no session required): native ROPC login, social /
        // interactive redirects, the OIDC callback, logout, and the providers probe
        // used by the login page. Must be registered before the API guard below.
        app.use(createPublicAuthRouter());

        // Everything else under /api requires a valid session (JSON 401 otherwise).
        app.use('/api', requireApiAuth);
        app.use(createProtectedAuthRouter());
        app.use(apiRouter);

        // Enforce the login redirect: unauthenticated page loads are 302'd to
        // /login (public pages /login and /logged-out pass through). The SPA shell
        // is then served by uiRouter; the API guard above protects the data.
        app.use(guardUi);
        app.use(uiRouter);
       
        // Global error handler - always return JSON
        app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
            console.error('Unhandled error:', err);
            res.status(500).json({
                success: false,
                error: err.message || 'Internal server error',
            });
        });

        this.server = app.listen(PORT);
    }

    async close() {
        const { onClose } = this.options;
        await this.uiClose?.();
        await new Promise<void>((resolve, reject) => {
            this.server?.close((err) => {
                if (err) {
                    return reject(err);
                }
                return resolve();
            });
        });
        await onClose();
    }
}
