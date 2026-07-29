/**
 * Boards API: POST /api/boards, GET /api/boards/:id, POST /api/boards/:id/join, GET /health.
 */

import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { boards, boardMembers } from '../db/schema';
import { getDb } from '../db/client';

const CreateBoardBody = z.object({
  name: z.string().min(1).max(120).optional(),
});

const JoinBody = z.object({});

export async function registerBoardRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/boards
   * Create a board, insert a single board_members row with role='owner',
   * return { id, token } (design.md D9).
   */
  app.post('/api/boards', async (request, reply) => {
    const parsed = CreateBoardBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', issues: parsed.error.issues });
    }
    const id = randomUUID();
    const db = getDb();
    await db.insert(boards).values({ id, name: parsed.data.name ?? 'Untitled board' });
    await db.insert(boardMembers).values({ boardId: id, role: 'owner' });

    const token = app.issueToken({ boardId: id, role: 'owner' });
    return reply.code(201).send({ id, token });
  });

  /**
   * GET /api/boards/:id — board metadata.
   * Requires auth: token must match boardId.
   */
  app.get(
    '/api/boards/:id',
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (request.user.boardId !== id) {
        return reply.code(403).send({ error: 'forbidden', message: 'Token does not match board' });
      }
      const db = getDb();
      const [row] = await db.select().from(boards).where(eq(boards.id, id)).limit(1);
      if (!row) {
        return reply.code(404).send({ error: 'not_found' });
      }
      return reply.send({
        id: row.id,
        name: row.name,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        role: request.user.role,
      });
    },
  );

  /**
   * POST /api/boards/:id/join — issue role-scoped token based on board_members row.
   * (design.md D9: "the path that scales to real users")
   *
   * V1: anonymous join. The first board_members row for the board determines
   * the role. When users land, replace "look up any row" with
   * "look up row for (userId, boardId)".
   */
  app.post('/api/boards/:id/join', async (request, reply) => {
    JoinBody.parse(request.body ?? {});
    const { id } = request.params as { id: string };
    const db = getDb();
    const [member] = await db
      .select()
      .from(boardMembers)
      .where(eq(boardMembers.boardId, id))
      .limit(1);
    if (!member) {
      return reply.code(404).send({ error: 'not_found', message: 'Board not found' });
    }
    const token = app.issueToken({ boardId: id, role: member.role });
    return reply.send({ token, role: member.role });
  });

  /**
   * GET /health — readiness probe.
   * Used by Docker healthcheck and the verification tests (task 12.4).
   */
  app.get('/health', async (_request, reply) => {
    return reply.send({ ok: true, version: '0.1.0' });
  });

  // Reference unused symbols to satisfy noUnusedParameters in strict mode.
  void and;
}
