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
    if (err?.code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error(
        `The "${service}" service requires the optional dependency "${moduleName}", which is not installed. Install it with: npm install ${moduleName} (required only for the "${service}" service).`
      );
    }
    throw err;
  }
}

// config.service selects the provider. Returns a promise that resolves to
// send(opts, cb) where opts is a canonical email object (see ./normalize)
// and cb is (err, result).
export default async function createSender(config) {
  if (config.service === 'mandrill') {
    // Mandrill has no SDK dependency; we POST directly to its REST API using
    // the built-in fetch (available globally in Node ≥18, stable by Node 24).
    // `apiKey` is the canonical field; `accessKeyId` is a legacy alias kept for
    // backward compatibility with older configs.
    const apiKey = config.apiKey || config.accessKeyId;
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
          cb(null, data);
        })
        .catch(cb);
    };
  }

  if (config.service === 'resend') {
    // Lazily load the Resend SDK only when this service is selected.
    const Resend = (await lazyImport('resend', 'resend')).Resend;
    const resend = new Resend(config.apiKey || config.accessKeyId);
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
    // Lazily load the SendGrid SDK only when this service is selected.
    // It's a CommonJS package, it lives on the default export
    const sgMail = (await lazyImport('@sendgrid/mail', 'sendgrid')).default;
    sgMail.setApiKey(config.apiKey || config.accessKeyId);
    return (opts, cb) => {
      // SendGrid rejects its promise on failure, so the second .then handler
      // (cb) receives any error directly.
      sgMail.send(formatEmail.toSendgrid(opts)).then((result) => {
        cb(null, result);
      }, cb);
    };
  }

  // Default: treat config.service as an SMTP host and send via nodemailer.
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