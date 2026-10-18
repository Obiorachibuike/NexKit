import { NotFoundError } from "@nexkitjs/errors";
import { getValidated, validateRequest } from "@nexkitjs/express";
import { created, ok, paginated, parsePagination } from "@nexkitjs/response";
import { Router } from "express";
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

export const usersRouter = Router();

usersRouter.get("/", (req, res) => {
  const { page, pageSize, offset, limit } = parsePagination(req.query, { maxPageSize: 50 });
  const all = [...users.values()];
  res.json(
    paginated(
      all.slice(offset, offset + limit),
      { page, pageSize, total: all.length },
      { requestId: req.id },
    ),
  );
});

usersRouter.get("/:id", validateRequest({ params: UserParams }), (req, res) => {
  const { params } = getValidated<unknown, unknown, z.infer<typeof UserParams>>(req);
  const user = users.get(params.id);
  if (!user) throw new NotFoundError(`User ${params.id} not found`);
  res.json(ok(user, { requestId: req.id }));
});

usersRouter.post("/", validateRequest({ body: CreateUser }), (req, res) => {
  const { body } = getValidated<z.infer<typeof CreateUser>>(req);
  const user: User = { id: users.size + 1, ...body };
  users.set(user.id, user);
  res.status(201).json(created(user, { requestId: req.id }));
});

usersRouter.get("/:id/crash", () => {
  // Demonstrates that unexpected errors never leak internals to clients.
  throw new Error("connection to db://admin:s3cret@10.0.0.5 refused");
});
