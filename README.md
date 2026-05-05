# parseable-pino

[Pino v7+ transport](https://getpino.io/#/docs/transports?id=v7-transports) for [Parseable](https://www.parseable.com/).

## Install

```shell
npm i parseable-pino
```

## Usage

### Basic

```ts
import { pino } from "pino";
import { ParseableTransportOptions } from "parseable-pino";

const myUsername = "foo";
const myPassword = "bar";
const auth = Buffer.from(`${myUsername}:${myPassword}`).toString("base64");

const options: ParseableTransportOptions = {
    endpoint: "https://my-parseable-instance.com/api/v1/logstream/my-stream",
    authorization: auth
};

const logger = pino({
    transport: {
        target: "parseable-pino",
        options
    }
});

logger.info("Hello world");
```

### With Resilience Options

```ts
const options: ParseableTransportOptions = {
    endpoint: "https://my-parseable-instance.com/api/v1/logstream/my-stream",
    authorization: auth,
    timeout: 10000, // 10s timeout (default: 5000ms)
    maxRetries: 5, // retry 5 times (default: 3)
    retryDelay: 2000 // initial delay 2s (default: 1000ms), increases exponentially
};

const logger = pino({
    transport: {
        target: "parseable-pino",
        options
    }
});
```

This transport is best-effort by default. If Parseable is slow or unavailable, it retries using the configured policy, logs a local error, drops the failed log event, and keeps your app running.

## Configuration

### Required

- **endpoint** (string): Full Parseable API endpoint URL including stream name
    - Format: `https://your-parseable.com/api/v1/logstream/<stream-name>`
- **authorization** (string): Base64-encoded basic auth credentials
    - Format: `Base64(username:password)`

### Optional (Resilience)

- **timeout** (number, default: 5000): Fetch timeout in milliseconds
- **maxRetries** (number, default: 3): Maximum number of retry attempts
- **retryDelay** (number, default: 1000): Initial retry delay in milliseconds (increases exponentially with each retry)

## Features

- ✅ Automatic retry with exponential backoff
- ✅ Configurable timeout to prevent hung connections
- ✅ Best-effort delivery with local error reporting
- ✅ Drops failed log events after retries instead of crashing the host app
- ✅ Follows Pino v7+ transport spec

## Example with Express

```ts
import express from "express";
import { pino } from "pino";
import parseablePino from "parseable-pino";

const logger = pino({
    transport: {
        target: "parseable-pino",
        options: {
            endpoint: process.env.PARSEABLE_ENDPOINT,
            authorization: process.env.PARSEABLE_AUTH,
            timeout: 8000,
            maxRetries: 5
        }
    }
});

const app = express();

app.get("/", (req, res) => {
    logger.info("Request received");
    res.send("OK");
});

app.listen(3000);
```
