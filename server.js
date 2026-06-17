'use strict';

var express = require('express');
var morgan = require('morgan');

var send = require('./send');

module.exports = function (key, emailConfig, inport) {
  var timeouts = {};
  const emailSender = send(emailConfig);
  var testKey = createEquals(key);
  var app = express();
  var port = inport || process.env.PORT || 3000;

  app.use(morgan('dev'));
  app.use(express.json());

  function sendEmail(opts) {
    emailSender(opts, function (err, resp) {
      if (err) {
        console.error('Email error:', err);
      } else {
        console.log('Email sent:', resp);
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
    }, toMilliseconds(req.body.interval));

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
  var orig = Buffer.from(origKey);
  var len = orig.length;
  return testKey;
  function testKey(compare) {
    var comp = Buffer.from(compare);
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

// Convert an interval into milliseconds. Accepts a number (passed through as
// milliseconds) or an object with any of weeks/days/hours/minutes/seconds/
// milliseconds. Replaces the former `interval` dependency, which is unmaintained
// and relied on the now-removed util.isDate.
function toMilliseconds(i) {
  if (typeof i === 'number') {
    return i;
  }
  if (!i) {
    return NaN;
  }
  var weeks = i.weeks || 0;
  var days = (i.days || 0) + weeks * 7;
  var hours = (i.hours || 0) + days * 24;
  var minutes = (i.minutes || 0) + hours * 60;
  var seconds = (i.seconds || 0) + minutes * 60;
  return (i.milliseconds || 0) + seconds * 1000;
}
