import nock from "nock";
import { Transform } from "stream";
import pinoParseableTransport, * as pinoParseableModule from "../src";

const PARSEABLE_INSTANCE = "https://fake-parseable-instance.com";
const PARSEABLE_STREAM = "test";
const TEST_USERNAME = "foo";
const TEST_PASSWORD = "bar";
const TEST_KEY = "Zm9vOmJhcg==";
const TRANSPORT_OPTIONS: pinoParseableModule.ParseableTransportOptions = {
    endpoint: PARSEABLE_INSTANCE,
    stream: PARSEABLE_STREAM,
    auth: {
        key: TEST_KEY
    }
};
const TEST_LOG_ONE = {
    level: "info",
    your_pipeline: "is green"
};
const TEST_LOG_TWO = {
    level: "info",
    foo: "america ya! :D",
    bar: "HALLO! :D HALLO! :D HALLO! :D"
};

const reqheaders = {
    Authorization: `Basic ${TEST_KEY}`,
    "X-P-Stream": PARSEABLE_STREAM,
    "Content-Type": "application/json"
};

beforeAll(() => {
    nock(PARSEABLE_INSTANCE, { reqheaders }).persist().post("/api/v1/ingest", JSON.stringify(TEST_LOG_ONE)).reply(200);

    nock(PARSEABLE_INSTANCE, { reqheaders }).persist().post("/api/v1/ingest", JSON.stringify(TEST_LOG_TWO)).reply(200);
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe("transport key", () => {
    it("should correctly generate a basic key", () => {
        const key = pinoParseableModule.createBasicKey(TEST_USERNAME, TEST_PASSWORD);
        expect(key).toEqual(TEST_KEY);
    });
});

describe("transport send", () => {
    it("should give precedence to 'auth.key' when present", async () => {
        const spy = jest.spyOn(pinoParseableModule, "createBasicKey");
        await pinoParseableModule.send({
            endpoint: PARSEABLE_INSTANCE,
            stream: PARSEABLE_STREAM,
            auth: {
                key: TEST_KEY
            },
            data: TEST_LOG_ONE
        });
        expect(spy).toHaveBeenCalledTimes(0);
    });

    it("should generate a basic key when 'auth.key' is missing", async () => {
        const spy = jest.spyOn(pinoParseableModule, "createBasicKey");
        await pinoParseableModule.send({
            endpoint: PARSEABLE_INSTANCE,
            stream: PARSEABLE_STREAM,
            auth: {
                username: TEST_USERNAME,
                password: TEST_PASSWORD
            },
            data: TEST_LOG_ONE
        });
        expect(spy).toHaveBeenCalledTimes(1);
    });
});

describe("transport", () => {
    it("should successfully receive logs", async () => {
        const spy = jest.spyOn(pinoParseableModule, "send");
        const transform = (await pinoParseableTransport(TRANSPORT_OPTIONS)) as Transform;
        const logs = [TEST_LOG_ONE, TEST_LOG_TWO];
        const serializedLogs = logs.map((log) => JSON.stringify(log)).join("\n");
        transform.write(serializedLogs);
        transform.end();
        await new Promise<void>((resolve) => {
            transform.on("end", () => {
                expect(spy).toHaveBeenCalledTimes(2);
                resolve();
            });
        });
    });
});
