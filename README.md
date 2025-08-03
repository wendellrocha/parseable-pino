# parseable-pino

[Pino v7+ transport](https://getpino.io/#/docs/transports?id=v7-transports) for [Parseable](https://www.parseable.com/).

## Install

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
