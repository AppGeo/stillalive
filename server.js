'use strict';

var express = require('express');
var morgan = require('morgan');

var send = require('./send');

// Exported factory: starts an Express "dead man's switch" server.
//   key         - shared secret callers must present to arm/clear timeouts
//   emailConfig - provider config passed to ./send (selects SMTP/Mandrill/etc.)
//   inport      - optional port; falls back to PORT env var, then 3000
//
// Clients periodically PUT /still/alive/:id to (re)arm a per-id timer. If a
// client stops checking in, the timer fires and an alert email is sent.
module.exports = function (key, emailConfig, inport) {
  // Active timers keyed by id; each is replaced/cleared on the next check-in.
  var timeouts = {};
  var emailSender = send(emailConfig);
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
  // Arm (or re-arm) the watchdog timer for :id. Each call resets the countdown;
  // the email only fires if no further check-in arrives before it elapses.
  app.put('/still/alive/:id', function (req, res) {
    if (!testKey(req.body.key)) {
      return res.status(400).json({
        error: 'bad request'
      });
    }

    // Cancel any existing timer for this id so we restart the countdown clean.
    if (req.params.id in timeouts) {
      clearTimeout(timeouts[req.params.id]);
      delete timeouts[req.params.id];
    }

    // Schedule the alert. If this id checks in again first, the timer above is
    // cleared and this callback never runs.
    timeouts[req.params.id] = setTimeout(function () {
      sendEmail(req.body.email);
      delete timeouts[req.params.id];
    }, toMilliseconds(req.body.interval));

    res.json({
      'timeout set': req.body.interval
    });
  });

  // Manually cancel a pending timer for :id (e.g. on a clean shutdown).
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

// Build a comparator that checks a supplied key against the configured one.
// The comparison is constant-time (XORs every byte and ORs the differences)
// rather than short-circuiting, to avoid leaking the key via timing analysis.
function createEquals(origKey) {
  var orig = Buffer.from(origKey);
  var len = orig.length;
  return testKey;
  function testKey(compare) {
    var comp = Buffer.from(compare);
    // A length mismatch can't match; bail early (length isn't secret).
    if (comp.length !== len) {
      return false;
    }
    var out = 0;
    var i = -1;
    // Accumulate any differing bits across all bytes; out stays 0 iff equal.
    while (++i < len) {
      out |= orig[i] ^ comp[i];
    }
    return out === 0;
  }
}

// Convert an interval into milliseconds. Accepts a number (passed through as
// milliseconds) or an object with any of weeks/days/hours/minutes/seconds/
// milliseconds, which are summed.
function toMilliseconds(i) {
  if (typeof i === 'number') {
    return i;
  }
  // Covers null/undefined/empty -- mirrors the old dependency's NaN return.
  if (!i) {
    return NaN;
  }
  // Roll each larger unit down into the next, accumulating to milliseconds.
  var weeks = i.weeks || 0;
  var days = (i.days || 0) + weeks * 7;
  var hours = (i.hours || 0) + days * 24;
  var minutes = (i.minutes || 0) + hours * 60;
  var seconds = (i.seconds || 0) + minutes * 60;
  return (i.milliseconds || 0) + seconds * 1000;
}
