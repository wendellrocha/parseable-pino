# pino-parseable

[Pino](https://getpino.io/#/) v7+ transport for [Parseable](https://www.parseable.com/).

## Install

### Yarn

```shell
yarn add pino-parseable
```

### NPM

```shell
npm i pino-parseable
```

## Usage

```ts
import { pino } from "pino";
import { ParseableTransportOptions } from "pino-parseable";

const myUsername = "foo";
const myPassword = "bar";

const options: ParseableTransportOptions = {
    endpoint: "https://my-parseable-instance.com",
    stream: "my-test-stream",
    auth: {
        // provide your base64 encoded key directly
        key: Buffer.from(`${myUsername}:${myPassword}`).toString("base64"),
        // or provide your username and password as is
        username: myUsername,
        password: myPassword
    }
};

const logger = pino({
    transport: {
        target: "pino-parseable",
        options
    }
});

logger.info("Hello world");
```
