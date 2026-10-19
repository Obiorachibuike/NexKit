/**
 * Environment schema definitions.
 *
 * Each field describes how a raw `string | undefined` environment value is
 * parsed, validated and typed. Values are never echoed in error messages.
 */

interface BaseField<T> {
  /** Default used when the variable is unset or empty. Makes the field non-optional in the result type. */
  default?: T;
  /** When true the resulting property may be `undefined`. Defaults to false (required). */
  optional?: boolean;
  /**
   * Marks the value as sensitive. Secret fields are masked by {@link maskEnv}
   * and shown as `<secret>` in generated `.env.example` files. Keys that look
   * sensitive (PASSWORD, SECRET, TOKEN, KEY, …) are treated as secret automatically.
   */
  secret?: boolean;
  /** Human description used by the CLI and `.env.example` generation. */
  description?: string;
  /** Example value for documentation (`.env.example`). Never used as a default. */
  example?: string;
}

export interface StringField extends BaseField<string> {
  type: "string";
  minLength?: number;
  maxLength?: number;
  /** Regular expression the value must match. */
  pattern?: RegExp;
}

export interface NumberField extends BaseField<number> {
  type: "number";
  min?: number;
  max?: number;
  /** Require an integer. Defaults to false. */
  integer?: boolean;
}

export interface PortField extends BaseField<number> {
  /** Integer in the range 0–65535. */
  type: "port";
}

export interface BooleanField extends BaseField<boolean> {
  /** Accepts `true/false`, `1/0`, `yes/no`, `on/off` (case-insensitive). */
  type: "boolean";
}

export interface UrlField extends BaseField<string> {
  /** Must parse with the WHATWG `URL` constructor. Value is returned as the original string. */
  type: "url";
  /** Allowed protocols without the colon, e.g. `["postgres", "postgresql"]`. */
  protocols?: readonly string[];
}

export interface EnumField<V extends string = string> extends BaseField<V> {
  type: "enum";
  values: readonly V[];
}

export interface ListField extends BaseField<string[]> {
  /** Delimited list of strings (comma by default). Items are trimmed; empty items dropped. */
  type: "list";
  separator?: string;
  minItems?: number;
}

export interface JsonField<T = unknown> extends BaseField<T> {
  /** JSON-encoded value. Use `validate` to narrow the parsed value. */
  type: "json";
  validate?: (value: unknown) => value is T;
}

export interface CustomField<T> extends BaseField<T> {
  type: "custom";
  /** Parse the raw string. Throw (any error) to signal an invalid value; the message is reported. */
  parse: (raw: string, key: string) => T;
}

export type EnvField =
  | StringField
  | NumberField
  | PortField
  | BooleanField
  | UrlField
  | EnumField
  | ListField
  | JsonField
  | CustomField<unknown>;

/** A map of environment variable names to field definitions. */
export type EnvSchema = Record<string, EnvField>;

type FieldOutput<F> =
  F extends EnumField<infer V>
    ? V
    : F extends CustomField<infer T>
      ? T
      : F extends JsonField<infer T>
        ? T
        : F extends StringField | UrlField
          ? string
          : F extends NumberField | PortField
            ? number
            : F extends BooleanField
              ? boolean
              : F extends ListField
                ? string[]
                : never;

type IsOptional<F> = F extends { default: unknown }
  ? false
  : F extends { optional: true }
    ? true
    : false;

type OptionalKeys<S> = { [K in keyof S]: IsOptional<S[K]> extends true ? K : never }[keyof S];
type RequiredKeys<S> = Exclude<keyof S, OptionalKeys<S>>;

/** The validated, typed environment object inferred from a schema. */
export type InferEnv<S extends EnvSchema> = {
  readonly [K in RequiredKeys<S>]: FieldOutput<S[K]>;
} & {
  readonly [K in OptionalKeys<S>]?: FieldOutput<S[K]> | undefined;
} extends infer O
  ? { readonly [K in keyof O]: O[K] }
  : never;

/**
 * Identity helper that preserves literal types for later reuse
 * (e.g. sharing a schema between `validateEnv` and `generateEnvExample`).
 */
export function defineEnvSchema<const S extends EnvSchema>(schema: S): S {
  return schema;
}

const SECRET_KEY_PATTERN =
  /(PASS(WORD)?|SECRET|TOKEN|PRIVATE|CREDENTIAL|API_?KEY|ACCESS_?KEY|SIGNING_?KEY|ENCRYPTION_?KEY|_KEY$|DSN|DATABASE_URL|REDIS_URL|MONGO(DB)?_URI|CONNECTION_STRING)/i;

/** Returns true when a field should be treated as secret (explicit flag or key heuristics). */
export function isSecretField(key: string, field: EnvField): boolean {
  if (field.secret !== undefined) return field.secret;
  return SECRET_KEY_PATTERN.test(key);
}
