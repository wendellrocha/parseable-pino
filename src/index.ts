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

export type ParseableSendOptions = ParseableTransportOptions & {
    data: object;
};

export const createBasicKey = (username: string, password: string) => {
    return Buffer.from(`${username}:${password}`).toString("base64");
};

export const send = async (options: ParseableSendOptions) => {
    const { endpoint, stream, auth, data } = options;
    const body = JSON.stringify(data);
    const key = "key" in auth ? auth.key : createBasicKey(auth.username, auth.password);
    const headers: HeadersInit = {
        "X-P-Stream": stream,
        Authorization: `Basic ${key}`,
        "Content-Type": "application/json"
    };

    await fetch(new URL("/api/v1/ingest", endpoint), {
        method: "POST",
        redirect: "follow",
        body,
        headers
    });
};

export default async function (opts: ParseableTransportOptions) {
    return build(async function (source) {
        for await (const data of source) {
            send({ ...opts, data });
        }
    });
}
