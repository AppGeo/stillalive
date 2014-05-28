'use strict';
var express = require('express');
var morgan  = require('morgan');
var bodyParser = require('body-parser');
var nodemailer = require('nodemailer');
var interval = require('interval');
module.exports = function (config, inport) {
  var timeouts = {};
  var mandrill = nodemailer.createTransport('SMTP', config.smtp);
  var app = express();
  app.use(morgan('dev'));
  app.use(bodyParser());
  var port = inport || process.env.PORT || 3000;
  function sendEmail(opts) {
    mandrill.sendMail(opts, function (err, resp) {
      if (err) {
        console.log(err);
      } else {
        console.log('email sent');
      }
    });
  }
  app.put('/still/alive/:id', function (req, res) {
    if (req.body.key !== config.key) {
      return res.json(400, {
        bad: 'request'
      });
    }
    if (req.params.id in config.timeouts) {
      console.log('canceling timeout');
      clearTimeout(timeouts[req.params.id]);
      delete timeouts[req.params.id];
    }
    console.log('setting timeout for ', req.body.interval);
    timeouts[req.params.id] = setTimeout(function () {
      sendEmail(req.body.email);
      delete timeouts[req.params.id]; 
    }, interval(req.body.interval));
    res.json({ok: true});
  });

  console.log('app is listening on ' + port);
  app.listen(port);
  return app;
};