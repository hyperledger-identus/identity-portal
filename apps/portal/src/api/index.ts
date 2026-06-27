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
import { Request, Response, Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { type Context, restErrorHandler } from '../utils/rest';
import { generateOpenApiSpec, type RouterMount } from '../utils/openapi';
import { routeGroups } from './registry';
import { PORT } from '../config';

import packageJson from '../../package.json';

/**
 * Builds every route group's router for a given context.
 *
 * Shared by the runtime API server and the OpenAPI/client generator so both
 * see exactly the same routes.
 *
 * @category API
 */
export function buildRouterMounts(context: Context): RouterMount[] {
  return Object.entries(routeGroups).map(([basePath, factory]) => ({
    basePath,
    router: factory(context),
  }));
}

/**
 * Creates the main API router with all route groups mounted.
 * 
 * @param context - The application context containing database and task manager
 * @returns Express Router with all API routes
 * 
 * @category API
 */
export async function createAPIRouter(context: Context) {
  const apiRouter = Router();
  const router = Router();

  // Mount route groups from the registry (single source of truth)
  const mounts = buildRouterMounts(context);
  for (const { basePath, router: routerWithContext } of mounts) {
    apiRouter.use(basePath, routerWithContext.router);
  }

  // Serve Swagger UI in development mode
  if (process.env.NODE_ENV === 'development') {
    const openApiSpec = generateOpenApiSpec(mounts, {
      title: 'Identus Portal API',
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

  router.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({
        success: false,
        error: 'Not found',
    });
});


  return router;
}
