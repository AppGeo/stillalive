// send.js builds the email-sending function for the configured provider.
//
// The exported factory inspects config.service and returns a uniform
// `send(opts, cb)` callback regardless of provider. Each branch maps the
// caller's canonical email (via ./normalize) into that provider's native shape
// before sending, so the rest of the app only ever deals with one email format.
'use strict';
var https = require('https');
const { URL } = require('url');
var nodemailer = require('nodemailer');
var map = require('./normalize');

// Lazily require an optional SDK so it is only loaded (and only needs to be
// installed) when the matching email service is actually selected. This keeps
// resend/@sendgrid/mail as optional peer deps -- users who don't use them never
// have to install them. A missing module is rethrown as a clear, actionable
// error; any other require error is propagated unchanged.
function lazyRequire(moduleName, service) {
  try {
    return require(moduleName);
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND') {
      throw new Error(
        'The "' + service + '" service requires the optional dependency "' +
        moduleName + '", which is not installed. Install it with: npm install ' +
        moduleName + ' (required only for the "' + service + '" service).'
      );
    }
    throw err;
  }
}

// config.service selects the provider. Returns send(opts, cb) where opts is a
// canonical email object (see ./normalize) and cb is (err, result).
module.exports = function (config) {
  if (config.service === 'mandrill') {
    // Mandrill has no SDK dependency here; we POST directly to its REST API.
    var apiKey = config.accessKeyId;
    return function (opts, cb) {
      // Mandrill wants { key, message } -- map.toMandrill builds the message.
      var wrapper = {};
      wrapper.message = map.toMandrill(opts);
      wrapper.key = apiKey;
      var buff = new Buffer.from(JSON.stringify(wrapper));
      var mandrillUrl = new URL('https://mandrillapp.com/api/1.0/messages/send.json');
      var httpOptions = {
        hostname: mandrillUrl.hostname,
        path: mandrillUrl.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      };
      var req = https.request(httpOptions, function (res) {
        var data = '';
        res.on('error',cb).on('data', function (d) {
          data += d.toString();
        }).on('end', function () {
          cb(null, data);
        });
      });
      req.on('error', cb);
      req.write(buff);
      req.end();
    };
  };

  if (config.service === 'resend') {
    // Lazily load the Resend SDK only when this service is selected.
    var Resend = lazyRequire('resend', 'resend').Resend;
    var resend = new Resend(config.apiKey || config.accessKeyId);
    return function (opts, cb) {
      // Resend's SDK resolves (instead of rejecting) on API errors, returning
      // { data, error } -- so we surface result.error through the callback.
      resend.emails.send(map.toResend(opts)).then(function (result) {
        if (result && result.error) {
          return cb(result.error);
        }
        cb(null, result.data || result);
      }, cb);
    };
  }

  if (config.service === 'sendgrid') {
    // Lazily load the SendGrid SDK only when this service is selected.
    var sgMail = lazyRequire('@sendgrid/mail', 'sendgrid');
    sgMail.setApiKey(config.apiKey || config.accessKeyId);
    return function (opts, cb) {
      // SendGrid rejects its promise on failure, so the second .then handler
      // (cb) receives any error directly.
      sgMail.send(map.toSendgrid(opts)).then(function (result) {
        cb(null, result);
      }, cb);
    };
  }

  // Default: treat config.service as an SMTP host and send via nodemailer.
  var smtpConfig = {
    host: config.service,
    port: config.port || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: config.auth.user,
      pass: config.auth.pass
    }
  }
  const transporter = nodemailer.createTransport(smtpConfig);

  return function (opts, cb) {
    transporter.sendMail(map.toNodemailer(opts), function (err, info) {
      if (err) return cb(err);
      cb(null, info);
    });
  };
};