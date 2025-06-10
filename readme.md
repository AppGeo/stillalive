still alive
====

Confirm a process is still alive, and if it isn't, send an email about it.

This now works with any SMTP provider or Mandrill. 

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

`npm install -g stillalive`

`stillalive ./path/to/config port`

port is optional, defaults to process.env.PORT followed by 3000.

# usage

send a put to `host/still/alive/:id` where id is your app specific timeout's name

the body of your request should be json as follows. Note -- if using an SMTP provider instead of Mandrill, do not use an array for the to email addresses.

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
