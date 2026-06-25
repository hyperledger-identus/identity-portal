import express, { type Request, type Response, type NextFunction } from "express";
import cors from 'cors';
import { createAPIRouter } from "../api";
import { PORT } from "../config";
import {  createUIRouter } from "./ui";
import { type Server } from "node:http";
// import type SDK from "@hyperledger/identus-sdk";

type Options = {
    //  readonly agent: SDK.Agent,
     onClose: () => Promise<void>,
}

export class HttpServer {
    private server!: Server;
    private uiClose?: () => Promise<void>;
    constructor(
        private readonly options: Options,
    ) {}

    get context() {
        return {
            // agent: this.options.agent
        }
    }

    async start() {
        const app = express();

        app.use(cors());
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));

        // Mount the REST API under /api (plus /docs and /openapi.json in development).
        const apiRouter = await createAPIRouter(this.context);
        app.use(apiRouter);

        // 404 for unmatched API routes - return JSON instead of falling through to the UI.
        app.use('/api', (_req: Request, res: Response) => {
            res.status(404).json({
                success: false,
                error: 'Not found',
            });
        });

        // Serve the React UI at / (Vite dev middleware in development, static build in production).
        // Registered after the API so /api/* always wins; everything else is handled by the SPA.
        const ui = await createUIRouter(app);
        this.uiClose = ui.close;

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
