/**
 * ## REST API Layer
 * 
 * HTTP endpoints for the KYC Issuer Agent service.
 * All routes are mounted under `/api` and use the REST router framework for validation.
 * 
 * ### Adding new endpoints
 * 
 * If we wanted to create a new rest entity (ex, status) we would create a new file in the `src/api/**` directory and add it to the [apiRouter](./src/api/index.ts).
 * 
 * ```typescript
 * import { createRestRouter, Context } from '../../utils/rest';
 * 
 * export function createStatusRouter(context: Context) {
 *   return createRestRouter({ context })
 *     .get('/', {
 *       output: statusOutput,
 *       handler: async () => {
 *         return {
 *           success: true,
 *         };
 *       },
 *     });
 * }
 * ```
 * 
 * If the entity is a new entity we must also edit the [apiRouter](./src/api/index.ts) to mount the new router.
 * 
 * ```typescript
 * router.use('/entity-name', entityRouter.router);
 * ```
 * 
 * ### Available Endpoints
 * - `GET /api/status` - Health check and task queue status
 * - `GET /api/docs` - Swagger UI (development only)
 * 
 * @module API
 */
import pafh from 'node:path';
import fs from 'node:fs';
import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { type Context,type RouterWithRoutes, restErrorHandler } from '../utils/rest';
import { generateOpenApiSpec, type RouterMount } from '../utils/openapi';
import { PORT } from '../config';

import packageJson from '../../package.json';

/**
 * Creates the main API router with all route groups mounted.
 * 
 * @param context - The application context containing database and task manager
 * @returns Express Router with all API routes
 * 
 * @category API
 */
export async function createAPIRouter(context: Context) {
  const routers = new Map<string, RouterWithRoutes>();
  const apiRouter = Router();
  const router = Router();

  // Mount route groups
  const routes = fs
    .readdirSync(pafh.join(__dirname))
    .filter(file => !file.includes("."));

  for (const folder of routes) {
    const {
      default: {
        default: routerFn,
      },
    } = await import(pafh.join(__dirname, folder, 'index.js'));
    const routerWithContext = routerFn(context);
    //Add to the routers map for OpenAPI generation
    routers.set(`/${folder}`, routerWithContext);
    //Load API Routes
    apiRouter.use(`/${folder}`, routerWithContext.router);
  }

  // Serve Swagger UI in development mode
  if (process.env.NODE_ENV === 'development') {
    const openAPIRoutes: RouterMount[] = Array
      .from(routers.entries())
      .map(([basePath, router]) => ({ basePath, router }));

    const openApiSpec = generateOpenApiSpec(openAPIRoutes, {
      title: 'Lace KYC API',
      version: packageJson.version,
      description: packageJson.description,
      servers: [
        { url: `http://localhost:${PORT}/api`, description: 'Local development' },
      ],
    });

    router.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
    router.get('/openapi.json', (_req, res) => res.json(openApiSpec));
  }

  // Add error handling to the API Router with Zod (must be after routes)
  apiRouter.use(restErrorHandler);

  //Add all apiRoutes to the main router
  router.use('/api', apiRouter);

  return router;
}
