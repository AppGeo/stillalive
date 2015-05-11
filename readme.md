still alive
====

Confirm a process is still alive, and if it isn't, send an email about it.

Only works with mandrill so the config needs to be

```js
{
  "key": "server key",
  "api": "mandrill api key"
}
```

`npm install -g stillalive`

`stillalive ./path/to/config port`

port is optional, defaults to process.env.PORT followed by 3000.

# usage

send a put to `host/still/alive/:id` where id is your app specific timeout's name

the body of your request should be json with

```json
{
  "key": "server key (set in your config file)",
  "email": {
    "from_email": "you@domain.tld",
    "to": [
      {
        "type": "to",
        "email": "name@domain.tld",
        "name": "Their Name"
      }
    ],
    "subject": "subject line",
    "text": "text body of email"
  },
  "interval": {
    "minutes": 5
  }
}
```

interval field is passed to [interval](https://github.com/fixedset/interval).
