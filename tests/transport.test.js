const path = require("path");
const { once } = require("events");
const { spawn } = require("child_process");

const createTransport = require("../dist/index.js").default;

jest.setTimeout(15000);

function createOptions(overrides = {}) {
    return {
        endpoint: "https://parseable.example.com/api/v1/logstream/test",
        authorization: "Zm9vOmJhcg==",
        timeout: 25,
        maxRetries: 0,
        retryDelay: 0,
        ...overrides
    };
}

async function writeLogLine(stream, line) {
    stream.end(`${line}\n`);
    await once(stream, "close");
}

describe("parseable-pino transport", () => {
    const originalFetch = global.fetch;
    const originalStringify = JSON.stringify;
    let consoleErrorSpy;

    beforeEach(() => {
        consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
        global.fetch = originalFetch;
        JSON.stringify = originalStringify;
    });

    test("logs and drops when fetch rejects", async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error("network down"));

        const transport = createTransport(createOptions());

        await writeLogLine(transport, '{"time":1714977285000,"level":30,"msg":"hello"}');

        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to send log after 0 retries: network down"));
    });

    test("retries non-2xx responses before dropping", async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 503,
            statusText: "Service Unavailable",
            text: jest.fn().mockResolvedValue("Backend error")
        });

        const transport = createTransport(createOptions({ maxRetries: 2 }));

        await writeLogLine(transport, '{"time":1714977285000,"level":30,"msg":"retry-me"}');

        expect(global.fetch).toHaveBeenCalledTimes(3);
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to send log after 2 retries: HTTP 503: Service Unavailable - Backend error"));
    });

    test("reports response body on non-2xx responses", async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 400,
            statusText: "Bad Request",
            text: jest.fn().mockResolvedValue('{"error":"invalid log format"}')
        });

        const transport = createTransport(createOptions({ maxRetries: 0 }));

        await writeLogLine(transport, '{"time":1714977285000,"level":30,"msg":"bad-req"}');

        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('HTTP 400: Bad Request - {"error":"invalid log format"}'));
    });

    test("aborts timed out requests and reports locally", async () => {
        global.fetch = jest.fn().mockImplementation((_url, options) => {
            return new Promise((_, reject) => {
                options.signal.addEventListener("abort", () => reject(new Error("aborted by timeout")), { once: true });
            });
        });

        const transport = createTransport(createOptions({ timeout: 10, maxRetries: 1 }));

        await writeLogLine(transport, '{"time":1714977285000,"level":30,"msg":"timeout"}');

        expect(global.fetch).toHaveBeenCalledTimes(2);
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to send log after 1 retries: aborted by timeout"));
    });

    test("contains serialization failures before fetch", async () => {
        global.fetch = jest.fn();
        JSON.stringify = jest.fn((value) => {
            if (value && value.msg === "serialize") {
                throw new Error("serialize failed");
            }

            return originalStringify(value);
        });

        const transport = createTransport(createOptions());

        await writeLogLine(transport, '{"time":1714977285000,"level":30,"msg":"serialize"}');

        expect(global.fetch).not.toHaveBeenCalled();
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to serialize log payload: serialize failed"));
    });

    test("keeps a real pino worker process alive when the endpoint is unreachable", async () => {
        const child = spawn(
            process.execPath,
            [
                "-e",
                `
const path = require("path");
const pino = require("pino");
const logger = pino({
  transport: {
    target: path.join(process.cwd(), "dist/index.js"),
    options: {
      endpoint: "http://10.255.255.1:65535/api/v1/logstream/test",
      authorization: "Zm9vOmJhcg==",
      timeout: 100,
      maxRetries: 0,
      retryDelay: 0
    }
  }
});

logger.info("hello from worker");
setTimeout(() => {
  console.log("process-alive");
  process.exit(0);
}, 400);
                `
            ],
            {
                cwd: path.resolve(__dirname, ".."),
                stdio: ["ignore", "pipe", "pipe"]
            }
        );

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (chunk) => {
            stdout += chunk.toString();
        });

        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        });

        const [code] = await once(child, "close");

        expect(code).toBe(0);
        expect(stdout).toContain("process-alive");
        expect(stderr).toContain("[parseable-pino] Failed to send log after 0 retries");
    });
});
