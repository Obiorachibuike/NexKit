import { createRequestContext, runWithRequestContext } from "@nexkitjs/core";
import { AppError } from "@nexkitjs/errors";
import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  LOG_LEVELS,
  callbackTransport,
  createLogger,
  createNoopLogger,
  jsonTransport,
  memoryTransport,
  multiTransport,
  prettyTransport,
  stringifyEntry,
  type LogEntry,
} from "../src/index.js";

function setup(options: Parameters<typeof createLogger>[0] = {}) {
  const transport = memoryTransport();
  const logger = createLogger({ transport, timestamp: () => "T", ...options });
  return { logger, entries: transport.entries, transport };
}

describe("createLogger", () => {
  it("emits structured entries with level, time, msg and fields", () => {
    const { logger, entries } = setup({ name: "api", base: { service: "billing" } });
    logger.info("hello");
    logger.info({ userId: 1 }, "with fields");
    logger.warn("fields second", { a: 1 });
    expect(entries).toEqual([
      { level: "info", levelValue: 30, time: "T", msg: "hello", name: "api", service: "billing" },
      {
        level: "info",
        levelValue: 30,
        time: "T",
        msg: "with fields",
        name: "api",
        service: "billing",
        userId: 1,
      },
      {
        level: "warn",
        levelValue: 40,
        time: "T",
        msg: "fields second",
        name: "api",
        service: "billing",
        a: 1,
      },
    ]);
  });

  it("respects levels and setLevel", () => {
    const { logger, entries } = setup({ level: "warn" });
    logger.info("skip");
    logger.debug("skip");
    logger.error("keep");
    expect(entries.map((e) => e.msg)).toEqual(["keep"]);
    expect(logger.isLevelEnabled("info")).toBe(false);
    logger.setLevel("trace");
    logger.trace("now kept");
    expect(entries).toHaveLength(2);
    expect(() => logger.setLevel("loud" as never)).toThrow(RangeError);
    expect(LOG_LEVELS.fatal).toBe(60);
  });

  it("reads LOG_LEVEL from the environment when not configured", () => {
    process.env.LOG_LEVEL = "error";
    try {
      const { logger } = setup();
      expect(logger.level).toBe("error");
    } finally {
      delete process.env.LOG_LEVEL;
    }
  });

  it("redacts sensitive fields including nested ones", () => {
    const { logger, entries } = setup();
    logger.info(
      { user: { password: "p", email: "e" }, authorization: "Bearer x", headers: { cookie: "c" } },
      "login",
    );
    expect(entries[0]).toMatchObject({
      user: { password: "[REDACTED]", email: "e" },
      authorization: "[REDACTED]",
      headers: { cookie: "[REDACTED]" },
    });
    const { logger: raw, entries: rawEntries } = setup({ redact: false });
    raw.info({ password: "p" }, "x");
    expect(rawEntries[0]?.password).toBe("p");
    const { logger: custom, entries: customEntries } = setup({
      redact: { keys: ["pin"], replacement: "#" },
    });
    custom.info({ pin: 1, password: "p" }, "x");
    expect(customEntries[0]).toMatchObject({ pin: "#", password: "#" });
  });

  it("serializes errors (plain and AppError) under `err`", () => {
    const { logger, entries } = setup();
    const cause = Object.assign(new Error("root"), { token: "secret-token" });
    logger.error(new Error("boom", { cause }));
    logger.error(
      {
        err: new AppError("db failed", { status: 500, meta: { password: "p", host: "h" } }),
        extra: 1,
      },
      "custom msg",
    );
    logger.error("msg only with err field", { err: new Error("x") });

    const first = entries[0]?.err as Record<string, unknown>;
    expect(entries[0]?.msg).toBe("boom");
    expect(first.message).toBe("boom");
    expect(first.stack).toContain("Error: boom");
    expect((first.cause as Record<string, unknown>).token).toBe("[REDACTED]");

    const second = entries[1]?.err as Record<string, unknown>;
    expect(entries[1]?.msg).toBe("custom msg");
    expect(entries[1]?.extra).toBe(1);
    expect(second.internalMessage).toBe("db failed");
    expect(second.meta).toEqual({ password: "[REDACTED]", host: "h" });
    expect(second.code).toBe("INTERNAL_ERROR");

    expect((entries[2]?.err as Record<string, unknown>).message).toBe("x");
  });

  it("honours includeStack=false and custom errorKey", () => {
    const { logger, entries } = setup({ includeStack: false, errorKey: "error" });
    logger.error(new Error("no stack"));
    expect((entries[0]?.error as Record<string, unknown>).stack).toBeUndefined();
    expect(entries[0]?.err).toBeUndefined();
  });

  it("attaches request context automatically", async () => {
    const { logger, entries } = setup();
    await runWithRequestContext(
      createRequestContext({ requestId: "r1", correlationId: "c1" }),
      async () => {
        await Promise.resolve();
        logger.info("inside");
      },
    );
    logger.info("outside");
    expect(entries[0]).toMatchObject({ requestId: "r1", correlationId: "c1" });
    expect(entries[1]?.requestId).toBeUndefined();

    const { logger: noCtx, entries: noCtxEntries } = setup({ includeContext: false });
    runWithRequestContext(createRequestContext({ requestId: "r2" }), () => noCtx.info("x"));
    expect(noCtxEntries[0]?.requestId).toBeUndefined();
  });

  it("creates child loggers with merged bindings and inherited level", () => {
    const { logger, entries } = setup({ name: "root", base: { a: 1 } });
    const child = logger.child({ b: 2, name: "child" });
    const grandchild = child.child({ c: 3 });
    grandchild.info("hi");
    expect(entries[0]).toMatchObject({ name: "child", a: 1, b: 2, c: 3 });
    expect(grandchild.bindings).toEqual({ a: 1, b: 2, c: 3 });
    child.setLevel("error");
    child.info("dropped");
    logger.info("root still logs");
    expect(entries.map((e) => e.msg)).toEqual(["hi", "root still logs"]);
  });

  it("never throws when a transport fails and reports it", () => {
    const failures: unknown[] = [];
    const logger = createLogger({
      transport: [
        callbackTransport(() => {
          throw new Error("sink down");
        }),
        memoryTransport(),
      ],
      onTransportError: (e) => failures.push(e),
    });
    expect(() => logger.info("x")).not.toThrow();
    expect(failures).toHaveLength(1);
  });

  it("flushes transports", async () => {
    let flushed = false;
    const logger = createLogger({
      transport: {
        write() {},
        flush() {
          flushed = true;
        },
      },
    });
    await logger.flush();
    expect(flushed).toBe(true);
  });

  it("noop logger emits nothing", () => {
    const logger = createNoopLogger();
    expect(logger.isLevelEnabled("fatal")).toBe(false);
    expect(() => logger.fatal("x")).not.toThrow();
  });
});

describe("transports", () => {
  function sink() {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(String(chunk));
        cb();
      },
    });
    return { stream, chunks };
  }

  it("jsonTransport writes NDJSON", () => {
    const { stream, chunks } = sink();
    const logger = createLogger({ transport: jsonTransport(stream), timestamp: () => "T" });
    logger.info({ n: 1n }, "big");
    expect(chunks).toHaveLength(1);
    expect(JSON.parse(chunks[0]!)).toEqual({
      level: "info",
      levelValue: 30,
      time: "T",
      msg: "big",
      n: "1",
    });
    expect(chunks[0]!.endsWith("\n")).toBe(true);
  });

  it("stringifyEntry handles circular structures", () => {
    const entry: LogEntry = { level: "info", levelValue: 30, time: "T", msg: "m" };
    entry.self = entry;
    expect(stringifyEntry(entry)).toContain('"self":"[Circular]"');
  });

  it("prettyTransport renders readable lines", () => {
    const { stream, chunks } = sink();
    const logger = createLogger({
      transport: prettyTransport({ stream, colors: false }),
      timestamp: () => "T",
      name: "app",
    });
    logger.warn({ a: 1 }, "careful");
    logger.error(new Error("bad"));
    expect(chunks[0]).toBe('T WARN  [app] careful {"a":1}\n');
    expect(chunks[1]).toContain("ERROR [app] bad");
    expect(chunks[1]).toContain("Error: bad");
  });

  it("multiTransport fans out and isolates failures", () => {
    const mem = memoryTransport();
    const t = multiTransport([
      {
        write() {
          throw new Error("x");
        },
      },
      mem,
    ]);
    t.write({ level: "info", levelValue: 30, time: "T", msg: "m" });
    expect(mem.entries).toHaveLength(1);
    mem.clear();
    expect(mem.entries).toHaveLength(0);
  });
});
