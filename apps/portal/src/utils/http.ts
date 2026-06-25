import express, { type Request, type Response, type NextFunction } from "express";
import cors from 'cors';
import { createAPIRouter } from "../api";
import { PORT } from "../config";
import {  createUIRouter } from "./ui";
import { type Server } from "node:http";
import {type Agent } from "@hyperledger/identus-sdk";

type Options = {
     readonly agent: Agent,
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
          agent: this.options.agent,
        }
    }

    async start() {
        const app = express();

        app.use(cors());
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));

        // Mount the REST API under /api (plus /docs and /openapi.json in development).
        // createAPIRouter already namespaces its routes under /api, so it must be
        // mounted at the root. It also has to come before the UI router: the Vite
        // dev SPA fallback serves index.html for every GET request, which would
        // otherwise swallow /api/* calls before they reach the API.
        const apiRouter = await createAPIRouter(this.context);
        const uiRouter = await createUIRouter();

        app.use(apiRouter);
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
