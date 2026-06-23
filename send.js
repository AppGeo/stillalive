// send.js builds the email-sending function for the configured provider.
//
// The exported factory inspects config.service and returns a uniform
// `send(opts, cb)` callback regardless of provider. Each branch maps the
// caller's canonical email (via ./normalize) into that provider's native shape
// before sending, so the rest of the app only ever deals with one email format.

import nodemailer from 'nodemailer';
import formatEmail from './normalize.js';

// Lazily import an optional SDK so it is only loaded (and only needs to be
// installed) when the matching email service is actually selected. This keeps
// resend/@sendgrid/mail as optional peer deps -- users who don't use them never
// have to install them. A missing module is rethrown as a clear, actionable
// error; any other import error is propagated unchanged.
async function lazyImport(moduleName, service) {
  try {
    return await import(moduleName);
  } catch (err) {
    // Only treat this as the optional dep being absent when the error actually
    // names the requested module -- a missing *transitive* dependency inside an
    // installed SDK also throws ERR_MODULE_NOT_FOUND and must not be misblamed.
    if (err?.code === 'ERR_MODULE_NOT_FOUND' && err.message.includes(`'${moduleName}'`)) {
      throw new Error(
        `The "${service}" service requires the optional dependency "${moduleName}", which is not installed. Install it with: npm install ${moduleName} (required only for the "${service}" service).`
      );
    }
    throw err;
  }
}

// Every API-based provider (Mandrill/Resend/SendGrid) authenticates with a
// string `apiKey`. Fail fast with a clear message when it is missing.
function requireApiKey(config, service) {
  if (typeof config.apiKey !== 'string' || config.apiKey.length === 0) {
    throw new TypeError(`The "${service}" service requires a non-empty string \`apiKey\`.`);
  }
}

// config.service selects the provider. Returns a promise that resolves to
// send(opts, cb) where opts is a canonical email object (see ./normalize)
// and cb is (err, result).
export default async function createSender(config) {
  if (!config || typeof config !== 'object' || typeof config.service !== 'string') {
    throw new TypeError(
      'Email provider config must be an object with a string `service` field. See the readme for each provider\'s config shape.'
    );
  }

  if (config.service === 'mandrill') {
    requireApiKey(config, 'mandrill');
    // Mandrill has no SDK dependency; we POST directly to its REST API using
    // the built-in fetch (available globally in Node ≥18, stable by Node 24).
    const apiKey = config.apiKey;
    return (opts, cb) => {
      const body = JSON.stringify({
        key: apiKey,
        message: formatEmail.toMandrill(opts),
      });
      fetch('https://mandrillapp.com/api/1.0/messages/send.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
        .then(async (res) => {
          const data = await res.text();
          // fetch only rejects on network errors, not HTTP error statuses, so
          // a 4xx/5xx (e.g. an invalid key) would otherwise look like a send.
          if (!res.ok) {
            return cb(new Error(`Mandrill request failed (${res.status}): ${data}`));
          }
          cb(null, data);
        })
        .catch(cb);
    };
  }

  if (config.service === 'resend') {
    requireApiKey(config, 'resend');
    // Lazily load the Resend SDK only when this service is selected.
    const Resend = (await lazyImport('resend', 'resend')).Resend;
    const resend = new Resend(config.apiKey);
    return (opts, cb) => {
      // Resend's SDK resolves (instead of rejecting) on API errors, returning
      // { data, error } -- so we surface result.error through the callback.
      resend.emails.send(formatEmail.toResend(opts)).then((result) => {
        if (result?.error) {
          return cb(result.error);
        }
        cb(null, result.data || result);
      }, cb);
    };
  }

  if (config.service === 'sendgrid') {
    requireApiKey(config, 'sendgrid');
    // Lazily load the SendGrid SDK only when this service is selected.
    // It's a CommonJS package, it lives on the default export
    const sgMail = (await lazyImport('@sendgrid/mail', 'sendgrid')).default;
    sgMail.setApiKey(config.apiKey);
    return (opts, cb) => {
      // SendGrid rejects its promise on failure, so the second .then handler
      // (cb) receives any error directly.
      sgMail.send(formatEmail.toSendgrid(opts)).then((result) => {
        cb(null, result);
      }, cb);
    };
  }

  // Default: treat config.service as an SMTP host and send via nodemailer.
  if (!config.auth || typeof config.auth.user !== 'string' || typeof config.auth.pass !== 'string') {
    throw new TypeError(
      `The SMTP service ("${config.service}") requires \`auth.user\` and \`auth.pass\` strings.`
    );
  }
  const smtpConfig = {
    host: config.service,
    port: config.port || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: config.auth.user,
      pass: config.auth.pass,
    },
  };
  const transporter = nodemailer.createTransport(smtpConfig);

  return (opts, cb) => {
    transporter.sendMail(formatEmail.toNodemailer(opts), (err, info) => {
      if (err) return cb(err);
      cb(null, info);
    });
  };
}