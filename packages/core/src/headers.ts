/**
 * Secure HTTP header presets.
 *
 * These helpers only *compute* a header map; framework adapters apply it.
 * Defaults are tuned for JSON APIs. If you serve HTML, review the
 * Content-Security-Policy and consider a dedicated library such as Helmet.
 */

export interface ContentSecurityPolicyOptions {
  /** Directive map, e.g. `{ "default-src": ["'self'"], "img-src": ["'self'", "data:"] }`. */
  directives?: Record<string, readonly string[] | string | boolean>;
  /** Send as `Content-Security-Policy-Report-Only` instead of enforcing. */
  reportOnly?: boolean;
}

export interface StrictTransportSecurityOptions {
  /** `max-age` in seconds. Defaults to 180 days. */
  maxAge?: number;
  /** Defaults to true. */
  includeSubDomains?: boolean;
  /** Defaults to false (requires manual preload-list submission). */
  preload?: boolean;
}

export interface SecureHeadersOptions {
  /**
   * Content-Security-Policy. Defaults to a strict API policy
   * (`default-src 'none'; frame-ancestors 'none'`). Pass `false` to disable.
   */
  contentSecurityPolicy?: ContentSecurityPolicyOptions | false;
  /**
   * Strict-Transport-Security. Enabled by default; only meaningful over HTTPS.
   * Pass `false` to disable (e.g. local HTTP development).
   */
  strictTransportSecurity?: StrictTransportSecurityOptions | false;
  /** Defaults to `"DENY"`. Pass `false` to disable. */
  frameOptions?: "DENY" | "SAMEORIGIN" | false;
  /** Defaults to `"no-referrer"`. Pass `false` to disable. */
  referrerPolicy?: string | false;
  /** Defaults to `"nosniff"`. Pass `false` to disable. */
  contentTypeOptions?: boolean;
  /** Defaults to `"same-origin"`. Pass `false` to disable. */
  crossOriginOpenerPolicy?: "same-origin" | "same-origin-allow-popups" | "unsafe-none" | false;
  /** Defaults to `"same-origin"`. Pass `false` to disable. */
  crossOriginResourcePolicy?: "same-origin" | "same-site" | "cross-origin" | false;
  /** Defaults to `"off"`. Pass `false` to disable. */
  dnsPrefetchControl?: "on" | "off" | false;
  /**
   * Permissions-Policy. Defaults to disabling camera, microphone, geolocation,
   * payment and interest-cohort. Pass `false` to disable.
   */
  permissionsPolicy?: Record<string, readonly string[]> | false;
  /** Set `X-Download-Options: noopen` (legacy IE). Defaults to false. */
  downloadOptions?: boolean;
  /** Extra headers merged last (overrides). */
  extra?: Record<string, string>;
}

/** Headers that should be removed because they leak implementation details. */
export const HEADERS_TO_REMOVE: readonly string[] = ["x-powered-by", "server"];

const DEFAULT_CSP: Record<string, readonly string[]> = {
  "default-src": ["'none'"],
  "frame-ancestors": ["'none'"],
  "base-uri": ["'none'"],
  "form-action": ["'none'"],
};

const DEFAULT_PERMISSIONS: Record<string, readonly string[]> = {
  camera: [],
  microphone: [],
  geolocation: [],
  payment: [],
  usb: [],
  "interest-cohort": [],
};

/** Serializes a CSP directive map into a header value. */
export function serializeContentSecurityPolicy(
  directives: Record<string, readonly string[] | string | boolean>,
): string {
  const parts: string[] = [];
  for (const [name, value] of Object.entries(directives)) {
    if (value === false) continue;
    if (value === true) {
      parts.push(name);
      continue;
    }
    const values = typeof value === "string" ? [value] : value;
    parts.push(values.length ? `${name} ${values.join(" ")}` : name);
  }
  return parts.join("; ");
}

/** Serializes a Permissions-Policy map (`{ camera: [] }` → `camera=()`). */
export function serializePermissionsPolicy(policy: Record<string, readonly string[]>): string {
  return Object.entries(policy)
    .map(([feature, allow]) => {
      const list = allow
        .map((origin) => (origin === "self" || origin === "*" ? origin : `"${origin}"`))
        .join(" ");
      return `${feature}=(${list})`;
    })
    .join(", ");
}

/**
 * Builds the secure header map. All header names are lower-case.
 *
 * @example
 * secureHeaders({ strictTransportSecurity: false }) // for local HTTP dev
 */
export function secureHeaders(options: SecureHeadersOptions = {}): Record<string, string> {
  const headers: Record<string, string> = {};

  if (options.contentSecurityPolicy !== false) {
    const csp = options.contentSecurityPolicy ?? {};
    const name = csp.reportOnly ? "content-security-policy-report-only" : "content-security-policy";
    headers[name] = serializeContentSecurityPolicy(csp.directives ?? DEFAULT_CSP);
  }

  if (options.strictTransportSecurity !== false) {
    const hsts = options.strictTransportSecurity ?? {};
    const maxAge = hsts.maxAge ?? 60 * 60 * 24 * 180;
    let value = `max-age=${Math.floor(maxAge)}`;
    if (hsts.includeSubDomains !== false) value += "; includeSubDomains";
    if (hsts.preload) value += "; preload";
    headers["strict-transport-security"] = value;
  }

  if (options.frameOptions !== false) headers["x-frame-options"] = options.frameOptions ?? "DENY";
  if (options.referrerPolicy !== false) {
    headers["referrer-policy"] = options.referrerPolicy ?? "no-referrer";
  }
  if (options.contentTypeOptions !== false) headers["x-content-type-options"] = "nosniff";
  if (options.crossOriginOpenerPolicy !== false) {
    headers["cross-origin-opener-policy"] = options.crossOriginOpenerPolicy ?? "same-origin";
  }
  if (options.crossOriginResourcePolicy !== false) {
    headers["cross-origin-resource-policy"] = options.crossOriginResourcePolicy ?? "same-origin";
  }
  if (options.dnsPrefetchControl !== false) {
    headers["x-dns-prefetch-control"] = options.dnsPrefetchControl ?? "off";
  }
  if (options.permissionsPolicy !== false) {
    headers["permissions-policy"] = serializePermissionsPolicy(
      options.permissionsPolicy ?? DEFAULT_PERMISSIONS,
    );
  }
  if (options.downloadOptions) headers["x-download-options"] = "noopen";

  for (const [key, value] of Object.entries(options.extra ?? {})) {
    headers[key.toLowerCase()] = value;
  }
  return headers;
}
