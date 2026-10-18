/**
 * @nexkitjs/config — type-safe environment validation.
 *
 * @packageDocumentation
 */
export { defineEnvSchema, isSecretField } from "./schema.js";
export type {
  BooleanField,
  CustomField,
  EnumField,
  EnvField,
  EnvSchema,
  InferEnv,
  JsonField,
  ListField,
  NumberField,
  PortField,
  StringField,
  UrlField,
} from "./schema.js";

export {
  EnvValidationError,
  generateEnvExample,
  maskEnv,
  safeValidateEnv,
  validateEnv,
} from "./validate.js";
export type { EnvIssue, SafeValidateResult, ValidateEnvOptions } from "./validate.js";
