'use strict';
var https = require('https');
const { URL } = require('url');
var nodemailer = require('nodemailer');

module.exports = function (config) {
  console.log(config);
  console.log('send.js config type:', typeof config);

  if (config.service === 'mandrill') {
    // If config is a string, assume it's the Mandrill API key
    var apiKey = config.accessKeyId;
    return function (opts, cb) {
      var wrapper = {};
      wrapper.message = opts;
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

  //Otherwise assume it's an SMTP config object
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
    transporter.sendMail(opts, function (err, info) {
      if (err) return cb(err);
      cb(null, info);
    });
  };
};