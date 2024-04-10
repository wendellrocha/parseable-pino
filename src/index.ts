import build from "pino-abstract-transport";

export type ParseableUsernamePasswordAuth = {
    /**
     * The username for your parseable instance.
     */
    username: string;

    /**
     * The password for your parseable instance.
     */
    password: string;
};

export type ParseableKeyAuth = {
    /**
     * The base64 encoded version of your credentials.
     *
     * Reference: https://www.parseable.com/docs/parseable-key-concepts
     */
    key: string;
};

export type ParseableAuth = ParseableUsernamePasswordAuth | ParseableKeyAuth;

export type ParseableTransportOptions = Omit<Parameters<typeof build>[1], "enablePipelining"> & {
    /**
     * The parseable endpoint to send logs to
     */
    endpoint: string;

    /**
     * The name of the stream to send logs to
     */
    stream: string;

    /**
     * The authentication credentials for your parseable instance. Can provide a pre-encoded key or
     * a username and password to convert into a key. If both are provided, the pre-encoded
     * key takes precedence.
     */
    auth: ParseableAuth;
};

type ParseableSendOptions = ParseableTransportOptions & {
    data: string;
};

const send = (options: ParseableSendOptions) => {
    const { endpoint, stream, auth, data } = options;
    let body: string;
    try {
        body = JSON.stringify(data);
    } catch (e) {
        body = JSON.stringify({ data });
    }

    const key = "key" in auth ? auth.key : Buffer.from(`${auth.username}:${auth.password}`).toString("base64");

    const headers: HeadersInit = {
        "X-P-Stream": stream,
        Authorization: `Basic ${key}`,
        "Content-Type": "application/json"
    };

    fetch(`${endpoint}/api/v1/ingest`, {
        method: "POST",
        redirect: "follow",
        body,
        headers
    });
};

export default async function (opts: ParseableTransportOptions) {
    return build(async function (source) {
        source.on("data", (data) => send({ ...opts, data }));
    });
}
