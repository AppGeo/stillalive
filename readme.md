still alive
====

Confirm a process is still alive, and if it isn't, send an email about it.

This now works with any SMTP provider, Mandrill, Resend, or SendGrid.

If using SMTP, specify your SMTP provider in your JSON such as:

```js
{
    "key": "my-secret-key",
    "smtp":{
      "service":"smtp-mail.outlook.com",
      "auth": {
        "user":"user@example.com",
        "pass":"insert_password_here"
      }
    }
  }
  
```

If using mandrill:

```js
{
    "key": "my-secret-key",
    "smtp":{
      "service":"mandrill",
      "accessKeyId": "md-EgWVMWEjZF2KdSlocGs2Aw"
    }
  }
  
```

## Resend and SendGrid

Resend and SendGrid are supported through their official SDKs, which are
declared as **optional peer dependencies**. They are not installed by default,
so they add no bloat unless you actually use them. Install only the one you
want:

```
npm install resend
# or
npm install @sendgrid/mail
```

The SDK is lazily `require()`d only when its service is selected, so the package
works fine with neither installed. If you select a service without installing
its SDK, you'll get a clear error telling you which package to install.

If using Resend:

```js
{
    "key": "my-secret-key",
    "smtp":{
      "service":"resend",
      "apiKey": "re_xxxxxxxxxxxx"
    }
  }
```

If using SendGrid:

```js
{
    "key": "my-secret-key",
    "smtp":{
      "service":"sendgrid",
      "apiKey": "SG.xxxxxxxxxxxx"
    }
  }
```

Whatever provider you configure, requests use the same canonical `email` object
(see [email object](#email-object) below) -- stillalive maps it to each
provider's native format for you.

`npm install -g stillalive`

`stillalive ./path/to/config port`

port is optional, defaults to process.env.PORT followed by 3000.

# usage

send a put to `host/still/alive/:id` where id is your app specific timeout's name

The body of your request should be json as follows. The `email` object uses a
single canonical shape that works the same no matter which provider you've
configured -- stillalive maps it internally to SMTP, Mandrill, Resend or
SendGrid:

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

Legacy Mandrill-style payloads (`from_email`/`from_name` plus a `to` array of
`{ "type", "email", "name" }`) are still accepted, so existing integrations keep
working without changes.

The `interval` field accepts a number of milliseconds, or an object with any of
`weeks`, `days`, `hours`, `minutes`, `seconds`, and `milliseconds` (which are
summed). For example, `{ "minutes": 5 }` or `{ "hours": 1, "minutes": 30 }`.
