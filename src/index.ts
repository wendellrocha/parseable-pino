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

export enum ParseableLogLevel {
    Trace = "trace",
    Debug = "debug",
    Info = "info",
    Warn = "warn",
    Error = "error",
    Fatal = "fatal",
    Silent = "silent"
}

const send = async (options: ParseableSendOptions) => {
    const { endpoint, authorization, data, timeout = 5000, maxRetries = 3, retryDelay = 1000 } = options;

    const body = JSON.stringify(data);
    const headers: HeadersInit = {
        Authorization: `Basic ${authorization}`,
        "Content-Type": "application/json"
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(endpoint, {
                method: "POST",
                redirect: "follow",
                body,
                headers,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt < maxRetries) {
                const delay = retryDelay * Math.pow(2, attempt);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }

    if (lastError) {
        console.error(`[parseable-pino] Failed to send log after ${maxRetries} retries: ${lastError.message}`);
    }
};

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
    return build(async function ingest(source) {
        for await (const obj of source) {
            const data = {
                ...obj,
                date: createDate(obj.time),
                level: mapLogLevel(obj.level)
            };

            send({ ...options, data });
        }
    });
};
