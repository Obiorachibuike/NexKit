import { NotFoundError } from "@nexkitjs/errors";
import { getValidated, validateRequest } from "@nexkitjs/fastify";
import { created, ok, paginated, parsePagination } from "@nexkitjs/response";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

interface User {
  id: number;
  name: string;
  email: string;
}

const users = new Map<number, User>([
  [1, { id: 1, name: "Ada Lovelace", email: "ada@example.com" }],
  [2, { id: 2, name: "Grace Hopper", email: "grace@example.com" }],
]);

const CreateUser = z.object({ name: z.string().min(2), email: z.string().email() });
const UserParams = z.object({ id: z.coerce.number().int().positive() });

export const usersRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    const { page, pageSize, offset, limit } = parsePagination(
      req.query as Record<string, unknown>,
      { maxPageSize: 50 },
    );
    const all = [...users.values()];
    return paginated(
      all.slice(offset, offset + limit),
      { page, pageSize, total: all.length },
      { requestId: req.id },
    );
  });

  app.get("/:id", { preHandler: validateRequest({ params: UserParams }) }, async (req) => {
    const { params } = getValidated<unknown, unknown, z.infer<typeof UserParams>>(req);
    const user = users.get(params.id);
    if (!user) throw new NotFoundError(`User ${params.id} not found`);
    return ok(user, { requestId: req.id });
  });

  app.post("/", { preHandler: validateRequest({ body: CreateUser }) }, async (req, reply) => {
    const { body } = getValidated<z.infer<typeof CreateUser>>(req);
    const user: User = { id: users.size + 1, ...body };
    users.set(user.id, user);
    return reply.code(201).send(created(user, { requestId: req.id }));
  });

  app.get("/:id/crash", async () => {
    // Demonstrates that unexpected errors never leak internals to clients.
    throw new Error("connection to db://admin:s3cret@10.0.0.5 refused");
  });
};
