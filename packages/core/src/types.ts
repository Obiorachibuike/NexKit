/** JSON-compatible primitive. */
export type JsonPrimitive = string | number | boolean | null;
/** JSON-compatible value. */
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
/** JSON-compatible object. */
export type JsonObject = { [key: string]: JsonValue };

/** A value or a promise of it. */
export type MaybePromise<T> = T | Promise<T>;

/** Make selected keys of `T` required. */
export type RequireKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;

/** Flattens intersections for nicer editor hover output. */
export type Prettify<T> = { [K in keyof T]: T[K] } & {};

/** Returns true for non-null objects that are not arrays. */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns true when `value` is a plain object literal (prototype is Object or null). */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/** Deep-freezes an object graph (plain objects and arrays only). */
export function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}
