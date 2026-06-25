/**
 * @module Utils
 * 
 * ## REST Router Framework
 * 
 * A lightweight, type-safe REST validation framework built on Express.
 * Provides automatic input/output validation using Zod schemas with a clean builder API.
 * 
 * ### Features
 * - **Type-safe routes**: Full TypeScript inference for request/response types
 * - **Automatic validation**: Input validation via Zod schemas
 * - **Builder pattern**: Fluent API for defining routes
 * - **Error handling**: Standardized error responses for validation failures
 * 
 * ### Usage
 * ```typescript
 * const router = createRestRouter({ context: { db, taskManager } });
 * 
 * router.get('/users/:id', {
 *   input: z.object({ id: z.string() }),
 *   output: userSchema,
 *   handler: async ({ input, ctx }) => {
 *     return await ctx.db.users.findById(input.id);
 *   }
 * });
 * ```
 * 
 * @category Utils
 */
import { type Request, type Response, Router, type NextFunction } from 'express';
import { type ZodSchema, ZodError } from 'zod';
// import type SDK from "@hyperledger/identus-sdk";

/**
 * Lightweight REST validation framework.
 * Provides type-safe, validated endpoints with a clean builder API.
 */
export type Context = any;

export type OpenAPIConfig = {
  /** Human-readable name for the operation (used as summary) */
  name?: string;
  /** Detailed description of what the operation does */
  description?: string;
  /** Tags for grouping operations. Inferred from router mount path if not provided */
  tags?: string[];
  /** Custom response definitions for additional status codes (e.g., error responses) */
  extraResponses?: Record<string, {
    description: string;
    schema?: ZodSchema;
  }>;
};

export type RouteConfig<TInput, TOutput> = {
  input?: ZodSchema<TInput>;
  output?: ZodSchema<TOutput>;
  /** Optional OpenAPI documentation metadata */
  openAPI?: OpenAPIConfig;
  handler: (params: {
    input: TInput;
    ctx: Context;
    req: Request;
    res: Response;
  }) => Promise<TOutput> | TOutput;
};

export type CreateRouterOptions = {
  context: Context;
};

export class HttpError extends Error {
  public statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'HttpError';
  }

  static BadRequest(message: string) {
    return new HttpError(400, message);
  }

  static Unauthorized(message: string) {
    return new HttpError(401, message);
  }

  static NotFound(message: string) {
    return new HttpError(404, message);
  }

  static Gone(message: string) {
    return new HttpError(410, message);
  }

  static InternalServerError(message: string) {
    return new HttpError(500, message);
  }
}

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export type RouteDefinition = {
  method: HttpMethod;
  path: string;
  config: RouteConfig<unknown, unknown>;
};

/** Type for router builders returned by createRestRouter, used for OpenAPI generation */
export type RouterWithRoutes = {
  router: ReturnType<typeof Router>;
  routes: RouteDefinition[];
};

/**
 * Creates a validated REST router with automatic input/output validation
 */
export function createRestRouter(options: CreateRouterOptions) {
  const routes: RouteDefinition[] = [];
  const router = Router();

  const createHandler = <TInput, TOutput>(
    config: RouteConfig<TInput, TOutput>
  ) => {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { context: ctx } = options;

        // Merge query, params, and body for input
        const rawInput = {
          ...req.query,
          ...req.params,
          ...req.body,
        };

        // Validate input if schema provided
        let input: TInput = rawInput as TInput;
        if (config.input) {
          const result = config.input.safeParse(rawInput);
          if (!result.success) {
            return res.status(400).json({
              success: false,
              error: 'Validation failed',
              details: formatZodError(result.error),
            });
          }
          input = result.data;
        }

        // Execute handler
        const output = await config.handler({ input, ctx, req, res });

        // Validate output if schema provided (development safety)
        if (config.output) {
          const outputResult = config.output.safeParse(output);
          if (!outputResult.success) {
            console.error('Output validation failed:', outputResult.error);
            return res.status(500).json({
              success: false,
              error: 'Internal server error',
            });
          }
        }

        // Send response
        return res.json(output);
      } catch (error) {
        next(error);
      }
    };
  };

  const routeBuilder = {
    get: <TInput = void, TOutput = unknown>(
      path: string,
      config: RouteConfig<TInput, TOutput>
    ) => {
      routes.push({ method: 'get', path, config: config as RouteConfig<unknown, unknown> });
      router.get(path, createHandler(config));
      return routeBuilder;
    },

    post: <TInput = void, TOutput = unknown>(
      path: string,
      config: RouteConfig<TInput, TOutput>
    ) => {
      routes.push({ method: 'post', path, config: config as RouteConfig<unknown, unknown> });
      router.post(path, createHandler(config));
      return routeBuilder;
    },

    put: <TInput = void, TOutput = unknown>(
      path: string,
      config: RouteConfig<TInput, TOutput>
    ) => {
      routes.push({ method: 'put', path, config: config as RouteConfig<unknown, unknown> });
      router.put(path, createHandler(config));
      return routeBuilder;
    },

    patch: <TInput = void, TOutput = unknown>(
      path: string,
      config: RouteConfig<TInput, TOutput>
    ) => {
      routes.push({ method: 'patch', path, config: config as RouteConfig<unknown, unknown> });
      router.patch(path, createHandler(config));
      return routeBuilder;
    },

    delete: <TInput = void, TOutput = unknown>(
      path: string,
      config: RouteConfig<TInput, TOutput>
    ) => {
      routes.push({ method: 'delete', path, config: config as RouteConfig<unknown, unknown> });
      router.delete(path, createHandler(config));
      return routeBuilder;
    },

    router,
    routes,
  };

  return routeBuilder;
}

/**
 * Formats Zod errors into a user-friendly structure
 */
function formatZodError(error: ZodError): Record<string, string[]> {
  const formatted: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_root';
    if (!formatted[path]) {
      formatted[path] = [];
    }
    formatted[path].push(issue.message);
  }

  return formatted;
}

/**
 * Global error handler middleware for REST routes
 */
export function restErrorHandler(
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error('REST Error:', error);

  if (error instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: formatZodError(error),
    });
  }

  if (error instanceof HttpError) {
    return res.status(error.statusCode).json({
      success: false,
      error: error.message,
    });
  }

  return res.status(500).json({
    success: false,
    error: error.message || 'Internal server error',
  });
}

/**
 * Helper to define input schemas with type inference
 */
export function defineInput<T extends ZodSchema>(schema: T) {
  return schema;
}

/**
 * Helper to define output schemas with type inference
 */
export function defineOutput<T extends ZodSchema>(schema: T) {
  return schema;
}
