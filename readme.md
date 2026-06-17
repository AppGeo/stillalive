still alive
====

Confirm a process is still alive, and if it isn't, send an email about it.

This works with any SMTP provider, Mandrill, Resend, or SendGrid.

## Installation

stillalive can be used two ways (see [Usage](#usage)): embedded in your own Node app as a library, or run directly as a CLI. Install accordingly:

| How you'll use it | Install |
| --- | --- |
| As a library (import it in your code) | `npm install stillalive` |
| As a CLI (run the `stillalive` command) | `npm install -g stillalive` |

Resend and SendGrid additionally need their official SDK, which ships as an **optional peer dependency** so it only gets installed if you actually use it (SMTP and Mandrill need nothing extra):

| Provider | Extra install |
| --- | --- |
| SMTP / Mandrill | none |
| Resend | `npm install resend` |
| SendGrid | `npm install @sendgrid/mail` |

The SDK is loaded via a dynamic `import()` only when its service is selected, so the package works fine with neither installed. If you configure `resend` or `sendgrid` without installing its SDK, stillalive fails fast at startup with a clear error telling you the exact `npm install` command to run.

## Usage

Both strategies take the same two pieces of configuration: a `key` (a shared secret callers must present) and a provider config object (see [Configuring an email provider](#configuring-an-email-provider)).

### As a library

`import stillalive from 'stillalive'` returns an async factory: `await stillalive(key, provider, port)`. It starts an Express server and returns the `app`, so you can add your own routes:

```js
import stillalive from 'stillalive';
import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile('./config.emailProvider.json', 'utf8'));
const port = process.env.PORT || 8080;

const app = await stillalive(config.key, config.provider, port);

app.get('/health', (_req, res) => {
  res.status(200).send('OK');
});
```

`port` is optional and defaults to `process.env.PORT`, then `3000`.

### As a CLI

Point the `stillalive` command at a JSON config file:

```
stillalive ./path/to/config.json [port]
```

`port` is optional and defaults to `process.env.PORT`, then `3000`. The config file holds the `key` and provider config (the provider object goes under `provider`; the legacy keys `smtp` and `api` are still accepted):

```json
{
  "key": "my-secret-key",
  "provider": {
    "service": "smtp-mail.outlook.com",
    "auth": {
      "user": "user@example.com",
      "pass": "insert_password_here"
    }
  }
}
```

## Configuring an email provider

The provider config object selects the email service via its `service` field. The examples below show it under the `provider` key of a CLI config file; when used as a library, pass the inner object as the second argument to `stillalive(key, provider, port)`. Ready-to-copy config files for each provider live in the [`examples/`](examples) folder.

If using SMTP, name your SMTP host as the `service` (see [examples/config.smtp.json](examples/config.smtp.json)):

```js
{
  "key": "my-secret-key",
  "provider": {
    "service": "smtp-mail.outlook.com",
    "auth": {
      "user": "user@example.com",
      "pass": "insert_password_here"
    }
  }
}
```

If using Mandrill (see [examples/config.mandrill.json](examples/config.mandrill.json)):

```js
{
  "key": "my-secret-key",
  "provider": {
    "service": "mandrill",
    "apiKey": "md-EgWVMWEjZF2KdSlocGs2Aw"
  }
}
```

(For Mandrill, `accessKeyId` is also accepted as a legacy alias for `apiKey`.)

If using Resend (requires `npm install resend`; see [examples/config.resend.json](examples/config.resend.json)):

```js
{
  "key": "my-secret-key",
  "provider": {
    "service": "resend",
    "apiKey": "re_xxxxxxxxxxxx"
  }
}
```

If using SendGrid (requires `npm install @sendgrid/mail`; see [examples/config.sendgrid.json](examples/config.sendgrid.json)):

```js
{
  "key": "my-secret-key",
  "provider": {
    "service": "sendgrid",
    "apiKey": "SG.xxxxxxxxxxxx"
  }
}
```

Whatever provider you configure, requests use the same canonical `email` object (see [email object](#email-object) below) -- stillalive maps it to each provider's native format for you.

# usage

send a put to `host/still/alive/:id` where id is your app specific timeout's name

The body of your request should be json as follows. The `email` object uses a single canonical shape that works the same no matter which provider you've configured -- stillalive maps it internally to SMTP, Mandrill, Resend or SendGrid:

```json
{
  "key": "server key (set in your config file)",
  "email": {
    "from": "you@domain.tld",
    "to": "name@domain.tld",
    "subject": "subject line",
    "text": "text body of email"
  },
  "interval": {
    "minutes": 5
  }
}
```

## email object

Every address field (`from`, `to`, `cc`, `bcc`, `replyTo`) accepts any of:

- a string: `"name@domain.tld"`
- a string with a display name: `"Their Name <name@domain.tld>"`
- an object: `{ "email": "name@domain.tld", "name": "Their Name" }`
- an array of any of the above (for `to`/`cc`/`bcc`)

Provide `text`, `html`, or both. A fuller example:

```json
{
  "from": { "email": "you@domain.tld", "name": "You" },
  "to": [
    "first@domain.tld",
    { "email": "second@domain.tld", "name": "Second Person" }
  ],
  "cc": "cc@domain.tld",
  "bcc": "bcc@domain.tld",
  "replyTo": "reply@domain.tld",
  "subject": "subject line",
  "text": "text body of email",
  "html": "<p>html body of email</p>"
}
```

Legacy Mandrill-style payloads (`from_email`/`from_name` plus a `to` array of `{ "type", "email", "name" }`) are still accepted, so existing integrations keep working without changes.

The `interval` field accepts a number of milliseconds, or an object with any of `weeks`, `days`, `hours`, `minutes`, `seconds`, and `milliseconds` (which are summed). For example, `{ "minutes": 5 }` or `{ "hours": 1, "minutes": 30 }`.
