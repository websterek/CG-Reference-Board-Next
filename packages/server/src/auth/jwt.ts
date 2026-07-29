/**
 * JWT auth — Fastify plugin.
 *
 * Token contains { boardId, role } per design.md D9. The board_members table
 * is the durable source of truth (task 3.5); the token is a stateless
 * conveyance of those claims, issued by Fastify, validated by Hocuspocus
 * onAuthenticate (server/src/collab/hocuspocus.ts).
 *
 * Migration to real users: replace "look up the only board_members row" with
 * "look up row for (userId, boardId)" — contained change (design.md D9).
 */

import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import type { AppConfig } from '../config/env';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      boardId: string;
      role: 'owner' | 'editor' | 'viewer';
      /** Token subject is a stable session id (not yet a user id) */
      sub: string;
    };
    user: {
      boardId: string;
      role: 'owner' | 'editor' | 'viewer';
      sub: string;
    };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Issue a token for `{boardId, role}`. */
    issueToken: (
      claims: { boardId: string; role: 'owner' | 'editor' | 'viewer' },
    ) => string;
    /** Decorator: ensure request has valid JWT; sets request.user. */
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export const jwtPlugin = fp(async function (app: FastifyInstance, opts: { config: AppConfig }) {
  await app.register(fastifyJwt, {
    secret: opts.config.JWT_SECRET,
    sign: { expiresIn: opts.config.JWT_EXPIRES_IN },
  });

  app.decorate('issueToken', (claims) => {
    const sub = `session_${Math.random().toString(36).slice(2, 14)}`;
    return app.jwt.sign({ ...claims, sub });
  });

  app.decorate('requireAuth', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.code(401).send({ error: 'unauthorized', message: 'Missing or invalid token' });
    }
  });
});

export {};
