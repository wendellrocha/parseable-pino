import build from "pino-abstract-transport";

export type ParseableUsernamePasswordAuth = {
    /**
     * The Basic authorization header.
     * Base64 from username:password
     */
    authorization: string;
};

export type ParseableAuth = ParseableUsernamePasswordAuth;

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
    auth: ParseableAuth;
};

export type ParseableSendOptions = ParseableTransportOptions & {
    data: object;
};

export const createBasicKey = (username: string, password: string) => {
    return Buffer.from(`${username}:${password}`).toString("base64");
};

export const send = async (options: ParseableSendOptions) => {
    const { endpoint, auth, data } = options;
    const body = JSON.stringify(data);
    const headers: HeadersInit = {
        Authorization: `Basic ${auth.authorization}`,
        "Content-Type": "application/json"
    };

    await fetch(endpoint, {
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
