import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request context propagated through async calls via `AsyncLocalStorage`.
 *
 * Framework adapters populate this at the start of every request; the logger
 * reads it to attach `requestId`/`correlationId` to every log line without
 * requiring you to thread a logger through every function call.
 */
export interface RequestContext {
  /** Unique identifier for this request (generated or trusted from an incoming header). */
  requestId: string;
  /** Identifier correlating a chain of requests across services. Defaults to `requestId`. */
  correlationId: string;
  /** High-resolution timestamp (ms, from `performance.now()`) when the request started. */
  startTime: number;
  /** Arbitrary additional metadata (user id, tenant, etc). */
  [key: string]: unknown;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** The underlying `AsyncLocalStorage` instance. Exposed for advanced integrations. */
export const requestContextStorage = storage;

/** Runs `fn` with the given context active for the duration of its (async) execution. */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/**
 * Binds the given context to the *current* async execution.
 * Use this in frameworks whose hook model doesn't let you wrap the continuation
 * (e.g. some middleware chains). Prefer {@link runWithRequestContext} when possible.
 */
export function enterRequestContext(context: RequestContext): void {
  storage.enterWith(context);
}

/** Returns the active request context, or `undefined` when called outside a request. */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Returns the active request id, or `undefined` outside of a request. */
export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/** Returns the active correlation id, or `undefined` outside of a request. */
export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

/**
 * Attaches a value to the active request context (e.g. `userId` after authentication).
 * Returns `false` when there is no active context.
 */
export function setRequestContextValue(key: string, value: unknown): boolean {
  const store = storage.getStore();
  if (!store) return false;
  if (key === "requestId" || key === "correlationId" || key === "startTime") {
    throw new TypeError(`"${key}" is reserved and cannot be overwritten`);
  }
  store[key] = value;
  return true;
}

/** Creates a fresh context object. Does not activate it. */
export function createRequestContext(
  init: Partial<RequestContext> & { requestId: string },
): RequestContext {
  const { requestId, correlationId, startTime, ...rest } = init;
  return {
    ...rest,
    requestId,
    correlationId: correlationId ?? requestId,
    startTime: startTime ?? performance.now(),
  };
}
