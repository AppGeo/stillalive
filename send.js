'use strict';
var https = require('https');
const { URL } = require('url');
var nodemailer = require('nodemailer');
var map = require('./normalize');

// Lazily require an optional SDK so it is only loaded (and only needs to be
// installed) when the matching email service is actually selected.
function lazyRequire(moduleName, service) {
  try {
    return require(moduleName);
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND') {
      throw new Error(
        'The "' + service + '" service requires the optional dependency "' +
        moduleName + '". Install it with: npm install ' + moduleName
      );
    }
    throw err;
  }
}

module.exports = function (config) {
  if (config.service === 'mandrill') {
    //If you've specified mandrill, use the mandrill API.
    var apiKey = config.accessKeyId;
    return function (opts, cb) {
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
      sgMail.send(map.toSendgrid(opts)).then(function (result) {
        cb(null, result);
      }, cb);
    };
  }

  // Otherwise configure an SMTP config object
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