import { z } from 'zod';

import {
  createCredentialSchemaSchema,
  credentialSchemaSchema,
  updateCredentialSchemaSchema,
  type CredentialSchemaResponse,
} from '../../schemas/credential-schemas';
import { ContextFactory, HttpError, createRestRouter } from '../../utils/rest';
import type { CredentialSchema } from '../../utils/agent/types';

/**
 * Maps a stored record onto the response DTO. The mapping is explicit so the
 * storage-only fields (`tenantId`) never reach the client: the framework sends
 * the handler's object as it is and only validates it against the schema.
 */
function toResponse(schema: CredentialSchema): CredentialSchemaResponse {
  return {
    uuid: schema.uuid,
    name: schema.name,
    version: schema.version,
    type: schema.type,
    // RIDB types the nested `properties` as a bare `object`, which is wider
    // than the record the DTO describes. The value is the JSON Schema the agent
    // stored, so it goes out as it is.
    schema: schema.schema as CredentialSchemaResponse['schema'],
    author: schema.author,
    description: schema.description,
    tags: schema.tags,
    createdAt: schema.createdAt,
    updatedAt: schema.updatedAt,
  };
}

export default function createSchemasRouter(createContext: ContextFactory) {
  return createRestRouter({ createContext })
    .get('/', {
      output: z.object({
        schemas: z.array(credentialSchemaSchema),
      }),
      openAPI: {
        name: 'GET SCHEMAS',
        description: 'Lists the credential schemas the agent holds.',
        tags: ['schemas'],
      },
      handler: async ({ ctx }) => {
        const schemas = await ctx.agent.schemas.list();
        return { schemas: schemas.map(toResponse) };
      },
    })
    .get('/:uuid', {
      input: z.object({
        uuid: z.string().min(1),
      }),
      output: credentialSchemaSchema,
      openAPI: {
        name: 'GET SCHEMA',
        description: 'Reads a single credential schema by its uuid.',
        tags: ['schemas'],
      },
      handler: async ({ input, ctx }) => {
        const schema = await ctx.agent.schemas.get(input.uuid);
        if (!schema) {
          throw HttpError.NotFound(`Schema ${input.uuid} not found`);
        }
        return toResponse(schema);
      },
    })
    .post('/', {
      input: createCredentialSchemaSchema,
      output: z.object({
        uuid: z.string(),
      }),
      openAPI: {
        name: 'POST SCHEMA',
        description: 'Creates a credential schema and returns its uuid.',
        tags: ['schemas'],
      },
      handler: async ({ input, ctx }) => {
        // The shared input type is the stored record without its keys, so it
        // still asks for the two timestamps. RIDB stamps its own on insert and
        // the cloud registry reports the time it authored the schema, so
        // neither agent keeps what is sent here.
        const now = Math.floor(Date.now() / 1000);
        const uuid = await ctx.agent.schemas.create({
          name: input.name,
          version: input.version,
          type: input.type,
          schema: input.schema,
          author: input.author,
          description: input.description ?? '',
          tags: input.tags ?? [],
          createdAt: now,
          updatedAt: now,
        });
        return { uuid };
      },
    })
    .put('/:uuid', {
      input: updateCredentialSchemaSchema,
      output: z.object({
        uuid: z.string(),
      }),
      openAPI: {
        name: 'PUT SCHEMA',
        description:
          'Updates a credential schema. The local agent edits the stored record; the cloud agent publishes a new version of it.',
        tags: ['schemas'],
      },
      handler: async ({ input, ctx }) => {
        const { uuid, ...changes } = input;
        await ctx.agent.schemas.update(uuid, changes);
        return { uuid };
      },
    })
    .delete('/:uuid', {
      input: z.object({
        uuid: z.string().min(1),
      }),
      output: z.object({
        success: z.literal(true),
      }),
      openAPI: {
        name: 'DELETE SCHEMA',
        description:
          'Deletes a credential schema. Only the local agent supports this; the cloud schema registry keeps every published version.',
        tags: ['schemas'],
      },
      handler: async ({ input, ctx }) => {
        try {
          await ctx.agent.schemas.delete(input.uuid);
        } catch (error) {
          // The cloud agent refuses this with an explicit reason. Report it as
          // "this backend cannot do it" and keep the reason, instead of letting
          // it fall through as a plain 500.
          const reason = error instanceof Error ? error.message : String(error);
          if (reason.includes('not supported')) {
            throw new HttpError(501, reason);
          }
          throw error;
        }
        return { success: true as const };
      },
    });
}
