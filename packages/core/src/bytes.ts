const UNITS: Record<string, number> = {
  b: 1,
  kb: 1024,
  mb: 1024 ** 2,
  gb: 1024 ** 3,
  tb: 1024 ** 4,
};

const SIZE_PATTERN = /^\s*(\d+(?:\.\d+)?)\s*([a-z]{1,2})?\s*$/i;

/**
 * Parses a human-readable size (`"1mb"`, `"512kb"`, `"100"`, `1024`) into bytes.
 * Throws a `RangeError` on invalid input. Numbers are treated as bytes.
 *
 * @example
 * parseByteSize("1mb"); // 1048576
 */
export function parseByteSize(input: string | number): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) {
      throw new RangeError(`Invalid byte size: ${input}`);
    }
    return Math.floor(input);
  }
  const match = SIZE_PATTERN.exec(input);
  if (!match) throw new RangeError(`Invalid byte size: "${input}"`);
  const amount = Number(match[1]);
  const unit = (match[2] ?? "b").toLowerCase();
  const multiplier = UNITS[unit];
  if (multiplier === undefined)
    throw new RangeError(`Unknown byte unit "${match[2]}" in "${input}"`);
  return Math.floor(amount * multiplier);
}

/** Formats a byte count as a short human-readable string (`1048576` → `"1 MB"`). */
export function formatByteSize(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) throw new RangeError(`Invalid byte count: ${bytes}`);
  if (bytes < 1024) return `${bytes} B`;
  const labels = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = -1;
  while (value >= 1024 && index < labels.length - 1) {
    value /= 1024;
    index += 1;
  }
  const rounded = Number(value.toFixed(decimals));
  return `${rounded} ${labels[index]}`;
}
