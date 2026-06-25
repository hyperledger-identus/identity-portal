/**
 * @module Utils
 *
 * ## OpenAPI Generator
 *
 * Automatically generates OpenAPI 3.1 specifications from Zod schemas
 * defined in the REST router framework.
 *
 * @category Utils
 */
import { type ZodSchema } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { RouterWithRoutes, RouteDefinition } from './rest';
import { errorResponseSchema } from '../schemas/error';

export type OpenApiConfig = {
  title: string;
  version: string;
  description?: string;
  servers?: Array<{ url: string; description?: string }>;
};

export type RouterMount = {
  basePath: string;
  router: RouterWithRoutes;
};

// Use a simple record type to avoid TypeScript's deep type instantiation with zod-to-json-schema
type JsonSchema = Record<string, unknown>;

type OpenApiDocument = {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{ url: string; description?: string }>;
  components: {
    schemas: Record<string, unknown>;
    parameters: Record<string, unknown>;
  };
  paths: Record<string, Record<string, PathOperation>>;
};

type PathOperation = {
  summary: string;
  description?: string;
  tags: string[];
  requestBody?: {
    required?: boolean;
    content: {
      'application/json': {
        schema: JsonSchema;
      };
    };
  };
  parameters?: Array<{
    name: string;
    in: 'path' | 'query';
    required: boolean;
    schema: { type: string };
  }>;
  responses: Record<string, ResponseObject>;
};

type ResponseObject = {
  description: string;
  content?: {
    'application/json': {
      schema: JsonSchema | Record<string, unknown>;
    };
  };
};

/**
 * Extracts field names from a JSON Schema (including nested objects).
 */
function extractFieldNames(schema: JsonSchema, prefix = ''): string[] {
  if (schema.type !== 'object' || !schema.properties) {
    return [];
  }

  const fields: string[] = [];
  const properties = schema.properties as Record<string, JsonSchema>;

  for (const [fieldName, fieldSchema] of Object.entries(properties)) {
    const path = prefix ? `${prefix}.${fieldName}` : fieldName;

    if (fieldSchema.type === 'object' && fieldSchema.properties) {
      fields.push(...extractFieldNames(fieldSchema, path));
    } else {
      fields.push(path);
    }
  }

  return fields;
}

/**
 * Builds a validation error schema with examples derived from the input schema
 */
function buildValidationErrorSchema(inputSchema?: ZodSchema): JsonSchema {
  let fields = ['field'];

  if (inputSchema) {
    const jsonSchema = zodToOpenApiSchema(inputSchema);
    const extracted = extractFieldNames(jsonSchema);
    if (extracted.length > 0) {
      fields = extracted;
    }
  }

  // Build example from field names
  const detailsExample = Object.fromEntries(
    fields.map((field) => [field, ['Invalid value']])
  );

  return {
    type: 'object',
    required: ['success', 'error', 'details'],
    properties: {
      success: { type: 'boolean', enum: [false] },
      error: { type: 'string', enum: ['Validation failed'] },
      details: {
        type: 'object',
        description:
          'Field-level validation errors. Keys are field paths, values are arrays of error messages.',
        additionalProperties: {
          type: 'array',
          items: { type: 'string' },
        },
        example: detailsExample,
      },
    },
    example: {
      success: false,
      error: 'Validation failed',
      details: detailsExample,
    },
  };
}

/**
 * Converts Express path params (e.g., :id) to OpenAPI format (e.g., {id})
 */
function convertPathParams(path: string): string {
  return path.replace(/:(\w+)/g, '{$1}');
}

/**
 * Extracts path parameter names from an Express route path
 */
function extractPathParams(path: string): string[] {
  const matches = path.match(/:(\w+)/g);
  return matches ? matches.map((m) => m.slice(1)) : [];
}

/**
 * Infers a tag from the base path (e.g., "/status" -> "Status")
 */
function inferTag(basePath: string): string {
  const segment = basePath.split('/').filter(Boolean)[0] || 'Default';
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

/**
 * Converts a Zod schema to JSON Schema, stripping metadata
 */
function zodToOpenApiSchema(schema: ZodSchema): JsonSchema {
  const jsonSchema = zodToJsonSchema(schema as any, {
    $refStrategy: 'none',
    target: 'openApi3',
  });

  // Remove $schema property as it's not needed in OpenAPI
  const { $schema, ...rest } = jsonSchema;
  return rest;
}

/**
 * Builds an OpenAPI path operation from a route definition
 */
function buildPathOperation(
  basePath: string,
  route: RouteDefinition
): PathOperation {
  const { method, path, config } = route;
  const fullPath = `${basePath}${path === '/' ? '' : path}`;
  const pathParams = extractPathParams(fullPath);

  // Extract OpenAPI metadata
  const { openAPI } = config;
  const tags = openAPI?.tags ?? [inferTag(basePath)];
  const summary = openAPI?.name ?? `${method.toUpperCase()} ${fullPath}`;
  const description = openAPI?.description;

  const hasBody = ['post', 'put', 'patch'].includes(method);

  const responses: Record<string, ResponseObject> = {
    200: {
      description: 'Successful response',
      content: config.output
        ? {
            'application/json': {
              schema: zodToOpenApiSchema(config.output),
            },
          }
        : undefined,
    },
    500: {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: zodToOpenApiSchema(errorResponseSchema),
        },
      },
    },
  };

  // Add custom responses (e.g., error responses)
  if (openAPI?.extraResponses) {
    for (const [status, responseConfig] of Object.entries(openAPI.extraResponses)) {
      responses[status] = {
        description: responseConfig.description,
        content: responseConfig.schema
          ? {
              'application/json': {
                schema: zodToOpenApiSchema(responseConfig.schema),
              },
            }
          : undefined,
      };
    }
  }

  // Only include 400 response if there's an input schema to validate
  if (config.input) {
    responses[400] = {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: buildValidationErrorSchema(config.input),
        },
      },
    };
  }

  const operation: PathOperation = {
    summary,
    ...(description && { description }),
    tags,
    responses,
  };

  // Add path parameters
  if (pathParams.length > 0) {
    operation.parameters = pathParams.map((name) => ({
      name,
      in: 'path' as const,
      required: true,
      schema: { type: 'string' },
    }));
  }

  // Add request body for POST/PUT/PATCH
  if (hasBody && config.input) {
    operation.requestBody = {
      required: true,
      content: {
        'application/json': {
          schema: zodToOpenApiSchema(config.input),
        },
      },
    };
  }

  // Add query parameters for GET/DELETE
  if (!hasBody && config.input) {
    const inputSchema = zodToOpenApiSchema(config.input) as Record<string, unknown>;
    
    if (inputSchema.type === 'object' && inputSchema.properties) {
      const properties = inputSchema.properties as Record<string, Record<string, unknown>>;
      const required = (inputSchema.required as string[]) || [];

      const queryParams = Object.entries(properties)
        .filter(([name]) => !pathParams.includes(name))
        .map(([name, schema]) => ({
          name,
          in: 'query' as const,
          required: required.includes(name),
          schema: { type: (schema.type as string) || 'string' },
        }));

      if (queryParams.length > 0) {
        operation.parameters = [...(operation.parameters ?? []), ...queryParams];
      }
    }
  }

  return operation;
}

/**
 * Generates an OpenAPI 3.1 specification from router definitions
 *
 * @param routers - Array of router mounts with their base paths
 * @param config - OpenAPI document configuration
 * @returns The complete OpenAPI specification object
 *
 * @example
 * ```typescript
 * const spec = generateOpenApiSpec(
 *   [{ basePath: '/status', router: statusRouter }],
 *   { title: 'My API', version: '1.0.0' }
 * );
 * ```
 */
export function generateOpenApiSpec(
  routers: RouterMount[],
  config: OpenApiConfig
): OpenApiDocument {
  const paths: Record<string, Record<string, PathOperation>> = {};

  // Process all routes from all routers
  for (const { basePath, router } of routers) {
    for (const route of router.routes) {
      const fullPath = `${basePath}${route.path === '/' ? '' : route.path}`;
      const openApiPath = convertPathParams(fullPath);

      if (!paths[openApiPath]) {
        paths[openApiPath] = {};
      }

      paths[openApiPath][route.method] = buildPathOperation(basePath, route);
    }
  }

  return {
    openapi: '3.1.0',
    info: {
      title: config.title,
      version: config.version,
      description: config.description,
    },
    servers: config.servers ?? [{ url: '/api', description: 'API base path' }],
    components: {
      schemas: {},
      parameters: {},
    },
    paths,
  };
}
