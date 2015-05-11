'use strict';

var express = require('express');
var morgan = require('morgan');
var bodyParser = require('body-parser');
var interval = require('interval');

var send = require('./send');

module.exports = function (key, apiKey, inport) {
  var timeouts = {};
  var mandrill = send(apiKey);
  var testKey = createEquals(key);
  var app = express();
  var port = inport || process.env.PORT || 3000;

  app.use(morgan('dev'));
  app.use(bodyParser());

  function sendEmail(opts) {
    mandrill(opts, function (err, resp) {
      if (err) {
        console.log(err);
      } else {
        console.log(resp);
      }
    });
  }
  app.get('/', function (req, res) {
    res.send('ok');
  });
  app.put('/still/alive/:id', function (req, res) {
    if (!testKey(req.body.key)) {
      return res.status(400).json({
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

    res.json({
      'timeout set': req.body.interval
    });
  });

  app.put('/clear/:id', function (req, res) {
    if (!testKey(req.body.key)) {
      return res.status(400).json({
        error: 'bad request'
      });
    }

    if (req.params.id in timeouts) {
      clearTimeout(timeouts[req.params.id]);
      delete timeouts[req.params.id];

      return res.json({'cleared': true});
    }
    res.status(400).json({
      error: 'no such timeout'
    });
  });

  console.log('app is listening on ' + port);
  app.listen(port);

  return app;
};
function createEquals(origKey) {
  var orig = new Buffer(origKey);
  var len = orig.length;
  return testKey;
  function testKey(compare) {
    var comp = new Buffer(compare);
    if (comp.length !== len) {
      return false;
    }
    var out = 0;
    var i = -1;
    while (++i < len) {
      out |= orig[i] ^ comp[i];
    }
    return out === 0;
  }
}
