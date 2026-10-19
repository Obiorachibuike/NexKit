import type { Writable } from "node:stream";
import type { LogEntry, LogTransport } from "./types.js";

/** Minimal writable interface (works with `process.stdout`, files, sockets, test sinks). */
export type WritableLike = Pick<Writable, "write">;

/** Safe JSON serialization: handles BigInt and circular references. */
export function stringifyEntry(entry: LogEntry): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(entry, (_key, value: unknown) => {
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    }
    return value;
  });
}

/** Newline-delimited JSON transport. The default destination is `process.stdout`. */
export function jsonTransport(stream: WritableLike = process.stdout): LogTransport {
  return {
    write(entry) {
      try {
        stream.write(stringifyEntry(entry) + "\n");
      } catch {
        // Logging must never crash the application.
      }
    },
    async flush() {
      await new Promise<void>((resolve) => {
        const maybeStream = stream as Partial<Writable>;
        if (typeof maybeStream.writableNeedDrain === "boolean" && maybeStream.writableNeedDrain) {
          maybeStream.once?.("drain", () => resolve());
        } else {
          resolve();
        }
      });
    },
  };
}

const LEVEL_COLORS: Record<string, string> = {
  trace: "\u001b[90m",
  debug: "\u001b[36m",
  info: "\u001b[32m",
  warn: "\u001b[33m",
  error: "\u001b[31m",
  fatal: "\u001b[35m",
};
const RESET = "\u001b[0m";
const DIM = "\u001b[2m";

export interface PrettyTransportOptions {
  stream?: WritableLike;
  /** Force colors on/off. Defaults to auto-detect from the stream's `isTTY`. */
  colors?: boolean;
}

/**
 * Human-friendly transport for local development. Not intended for production
 * (use {@link jsonTransport} and let your log pipeline do the pretty-printing).
 */
export function prettyTransport(options: PrettyTransportOptions = {}): LogTransport {
  const stream = options.stream ?? process.stdout;
  const colors = options.colors ?? Boolean((stream as { isTTY?: boolean }).isTTY);
  const paint = (code: string, text: string) => (colors ? `${code}${text}${RESET}` : text);

  return {
    write(entry) {
      const { level, time, msg, name, err, levelValue: _lv, ...rest } = entry;
      const label = paint(LEVEL_COLORS[level] ?? "", level.toUpperCase().padEnd(5));
      const scope = name ? paint(DIM, `[${name}] `) : "";
      const extras = Object.keys(rest).length ? ` ${paint(DIM, stringifyEntryLoose(rest))}` : "";
      let line = `${paint(DIM, time)} ${label} ${scope}${msg}${extras}\n`;
      if (err && typeof err === "object") {
        const e = err as { name?: string; message?: string; stack?: string };
        line += `    ${paint(LEVEL_COLORS.error ?? "", `${e.name ?? "Error"}: ${e.message ?? ""}`)}\n`;
        if (e.stack) {
          line += e.stack
            .split("\n")
            .slice(1)
            .map((l) => `    ${paint(DIM, l.trim())}`)
            .join("\n");
          line += "\n";
        }
      }
      try {
        stream.write(line);
      } catch {
        // ignore
      }
    },
  };
}

function stringifyEntryLoose(value: Record<string, unknown>): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

/** In-memory transport. Useful for tests and for buffering during startup. */
export interface MemoryTransport extends LogTransport {
  readonly entries: LogEntry[];
  clear(): void;
}

export function memoryTransport(): MemoryTransport {
  const entries: LogEntry[] = [];
  return {
    entries,
    write(entry) {
      entries.push(entry);
    },
    clear() {
      entries.length = 0;
    },
  };
}

/** Fan out to multiple transports. A failing transport never affects the others. */
export function multiTransport(transports: readonly LogTransport[]): LogTransport {
  return {
    write(entry) {
      for (const t of transports) {
        try {
          t.write(entry);
        } catch {
          // ignore
        }
      }
    },
    async flush() {
      await Promise.all(transports.map(async (t) => t.flush?.()));
    },
  };
}

/** Transport that forwards entries to a callback. */
export function callbackTransport(fn: (entry: LogEntry) => void): LogTransport {
  return { write: fn };
}
