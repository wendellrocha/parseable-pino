import build from "pino-abstract-transport";

export type ParseableTransportOptions = Omit<Parameters<typeof build>[1], "enablePipelining"> & {
    /**
     * The parseable endpoint to send logs to.
     * your-parseable.com/api/v1/logstream/<stream>
     */
    endpoint: string;

    /**
     * The authentication credentials for your parseable instance. Can provide a pre-encoded key or
     * a username and password to convert into a key. If both are provided, the pre-encoded
     * key takes precedence.
     */
    authorization: string;

    /**
     * Fetch timeout in milliseconds. Default: 5000
     */
    timeout?: number;

    /**
     * Maximum number of retry attempts. Default: 3
     */
    maxRetries?: number;

    /**
     * Initial retry delay in milliseconds. Increases exponentially. Default: 1000
     */
    retryDelay?: number;
};

type ParseableSendOptions = ParseableTransportOptions & {
    data: object;
};

type ReportError = (error: unknown, context: string) => void;

export enum ParseableLogLevel {
    Trace = "trace",
    Debug = "debug",
    Info = "info",
    Warn = "warn",
    Error = "error",
    Fatal = "fatal",
    Silent = "silent"
}

function toError(error: unknown) {
    return error instanceof Error ? error : new Error(String(error));
}

function reportError(error: unknown, context: string) {
    const message = toError(error).message;

    try {
        console.error(`[parseable-pino] ${context}: ${message}`);
    } catch {
        // Never allow transport diagnostics to crash the host application.
    }
}

function sleep(delay: number) {
    return new Promise((resolve) => setTimeout(resolve, delay));
}

async function send(options: ParseableSendOptions, handleError: ReportError) {
    const { endpoint, authorization, data, timeout = 5000, maxRetries = 3, retryDelay = 1000 } = options;

    let body: string;

    try {
        body = JSON.stringify(data);
    } catch (error) {
        handleError(error, "Failed to serialize log payload");
        return;
    }

    const headers: HeadersInit = {
        Authorization: `Basic ${authorization}`,
        "Content-Type": "application/json"
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        let timeoutId: ReturnType<typeof setTimeout> | undefined;

        try {
            const controller = new AbortController();
            timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(endpoint, {
                method: "POST",
                redirect: "follow",
                body,
                headers,
                signal: controller.signal
            });

            if (!response.ok) {
                const errorBody = await response.text().catch(() => "");
                throw new Error(`HTTP ${response.status}: ${response.statusText}${errorBody ? ` - ${errorBody}` : ""}`);
            }

            return;
        } catch (error) {
            lastError = toError(error);

            if (attempt < maxRetries) {
                await sleep(retryDelay * Math.pow(2, attempt));
            }
        } finally {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        }
    }

    if (lastError) {
        handleError(lastError, `Failed to send log after ${maxRetries} retries`);
    }
}

function isValidDate(date: Date) {
    return date instanceof Date && !Number.isNaN(date.getTime());
}

function createDate(epoch: number) {
    let date = new Date(epoch);
    if (isValidDate(date)) {
        return date;
    }

    date = new Date(+epoch);
    return date;
}

function mapLogLevel(level: string | number) {
    if (typeof level === "string") {
        return level;
    }

    if (level <= 10) {
        return ParseableLogLevel.Trace;
    }
    if (level <= 20) {
        return ParseableLogLevel.Debug;
    }
    if (level <= 30) {
        return ParseableLogLevel.Info;
    }
    if (level <= 40) {
        return ParseableLogLevel.Warn;
    }
    if (level <= 50) {
        return ParseableLogLevel.Error;
    }
    if (level <= 60) {
        return ParseableLogLevel.Fatal;
    }

    return ParseableLogLevel.Silent;
}

export default (options: ParseableTransportOptions) => {
    const inflight = new Set<Promise<void>>();

    function track(promise: Promise<void>) {
        inflight.add(promise);
        promise.finally(() => {
            inflight.delete(promise);
        });
    }

    function buildPayload(obj: { time: number; level: string | number; [key: string]: unknown }) {
        try {
            return {
                ...obj,
                date: createDate(obj.time),
                level: mapLogLevel(obj.level)
            };
        } catch (error) {
            reportError(error, "Failed to prepare log payload");
            return null;
        }
    }

    function enqueueSend(data: object) {
        const sendPromise = send({ ...options, data }, reportError);
        track(sendPromise);
        void sendPromise.catch((error) => {
            reportError(error, "Unexpected transport failure");
        });
    }

    return build(
        async function ingest(source) {
            try {
                for await (const obj of source) {
                    const data = buildPayload(obj);
                    if (!data) {
                        continue;
                    }

                    enqueueSend(data);
                }
            } catch (error) {
                reportError(error, "Unexpected ingest failure");
            }
        },
        {
            close: async () => {
                await Promise.allSettled(Array.from(inflight));
            }
        }
    );
};
