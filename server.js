'use strict';
var express = require('express');
var morgan  = require('morgan');
var bodyParser = require('body-parser');
var interval = require('interval');
var send = require('./send');
module.exports = function (config, inport) {
  var timeouts = {};
  var mandrill = send(config.smtp.auth.pass);
  var app = express();
  app.use(morgan('dev'));
  app.use(bodyParser());
  var port = inport || process.env.PORT || 3000;
  function sendEmail(opts) {
    mandrill(opts, function (err, resp) {
      if (err) {
        console.log(err);
      } else {
        console.log(resp);
      }
    });
  }
  app.put('/still/alive/:id', function (req, res) {
    if (req.body.key !== config.key) {
      return res.json(400, {
        error: 'bad request'
      });
    }
    if (req.params.id in timeouts) {
      clearTimeout(timeouts[req.params.id]);
      delete timeouts[req.params.id];
    }
    timeouts[req.params.id] = setTimeout(function () {
      sendEmail(req.body.email);
      delete timeouts[req.params.id]; 
    }, interval(req.body.interval));
    res.json({'timeout set': req.body.interval});
  });
  app.put('/clear/:id', function (req, res) {
    if (req.body.key !== config.key) {
      return res.json(400, {
        error: 'bad request'
      });
    }
    if (req.params.id in timeouts) {
      clearTimeout(timeouts[req.params.id]);
      delete timeouts[req.params.id];
      return res.json({'cleared': true});
    }
    res.json(400, {
        error: 'no such timeout'
      });
  });

  console.log('app is listening on ' + port);
  app.listen(port);
  return app;
};