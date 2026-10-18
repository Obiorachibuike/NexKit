import type { Request } from "express";

/** Parsed and validated request parts, populated by `validateRequest`. */
export interface ValidatedRequestParts<B = unknown, Q = unknown, P = unknown, H = unknown> {
  body: B;
  query: Q;
  params: P;
  headers: H;
}

declare module "express-serve-static-core" {
  interface Request {
    /** Request id assigned by `requestContext()`. */
    id?: string;
    /** Correlation id assigned by `requestContext()`. */
    correlationId?: string;
    /** Validated data populated by `validateRequest()`. */
    validated?: Partial<ValidatedRequestParts>;
  }
}

/** Helper to read validated parts with proper typing. */
export function getValidated<B = unknown, Q = unknown, P = unknown, H = unknown>(
  req: Request,
): ValidatedRequestParts<B, Q, P, H> {
  const v = (req.validated ?? {}) as Partial<ValidatedRequestParts<B, Q, P, H>>;
  return {
    body: (v.body ?? req.body) as B,
    query: (v.query ?? req.query) as Q,
    params: (v.params ?? req.params) as P,
    headers: (v.headers ?? req.headers) as H,
  };
}
