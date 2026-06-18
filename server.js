import express from 'express';
import morgan from 'morgan';

import createSender from './send.js';

// Exported factory: starts an Express "dead man's switch" server.
//   key         - shared secret callers must present to arm/clear timeouts
//   emailConfig - provider config passed to ./send (selects SMTP/Mandrill/etc.)
//   listenPort  - optional port; falls back to PORT env var, then 3000
//
// Clients periodically PUT /still/alive/:id to (re)arm a per-id timer. If a
// client stops checking in, the timer fires and an alert email is sent.
export default async function createServer(key, emailConfig, listenPort) {
  // Active timers keyed by id; each is replaced/cleared on the next check-in.
  const timeouts = {};
  const emailSender = await createSender(emailConfig);
  const testKey = createEquals(key);
  const app = express();
  const port = listenPort || process.env.PORT || 3000;

  app.use(morgan('dev'));
  app.use(express.json());

  const sendEmail = (opts) => {
    emailSender(opts, (err, resp) => {
      if (err) {
        console.error('Email error:', err);
      } else {
        console.log('Email sent:', resp);
      }
    });
  };

  app.get('/', (_req, res) => {
    res.send('ok');
  });

  // Arm (or re-arm) the watchdog timer for :id. Each call resets the countdown;
  // the email only fires if no further check-in arrives before it elapses.
  app.put('/still/alive/:id', (req, res) => {
    if (!testKey(req.body.key)) {
      return res.status(400).json({ error: 'bad request' });
    }

    // Reject an unusable interval up front
    const ms = toMilliseconds(req.body.interval);
    if (!Number.isFinite(ms) || ms < 0) {
      return res.status(400).json({ error: 'invalid interval' });
    }

    // Cancel any existing timer for this id so we restart the countdown clean.
    if (req.params.id in timeouts) {
      clearTimeout(timeouts[req.params.id]);
      delete timeouts[req.params.id];
    }

    // Schedule the alert. If this id checks in again first, the timer above is
    // cleared and this callback never runs.
    timeouts[req.params.id] = setTimeout(() => {
      sendEmail(req.body.email);
      delete timeouts[req.params.id];
    }, ms);

    res.json({ 'timeout set': req.body.interval });
  });

  // Manually cancel a pending timer for :id (e.g. on a clean shutdown).
  app.put('/clear/:id', (req, res) => {
    if (!testKey(req.body.key)) {
      return res.status(400).json({ error: 'bad request' });
    }

    if (req.params.id in timeouts) {
      clearTimeout(timeouts[req.params.id]);
      delete timeouts[req.params.id];
      return res.json({ cleared: true });
    }
    res.status(400).json({ error: 'no such timeout' });
  });

  console.log(`app is listening on ${port}`);
  app.listen(port);

  return app;
}

// Build a comparator that checks a supplied key against the configured one.
// The comparison is constant-time (XORs every byte and ORs the differences)
// rather than short-circuiting, to avoid leaking the key via timing analysis.
function createEquals(origKey) {
  const orig = Buffer.from(origKey);
  const len = orig.length;

  return (compare) => {
    const comp = Buffer.from(compare);
    // A length mismatch can't match; bail early (length isn't secret).
    if (comp.length !== len) {
      return false;
    }
    let out = 0;
    // Accumulate any differing bits across all bytes; out stays 0 iff equal.
    for (let i = 0; i < len; i++) {
      out |= orig[i] ^ comp[i];
    }
    return out === 0;
  };
}

// Convert an interval into milliseconds. Accepts a number (passed through as
// milliseconds) or an object with any of weeks/days/hours/minutes/seconds/
// milliseconds, which are summed.
function toMilliseconds(i) {
  if (typeof i === 'number') {
    return i;
  }
  // Return null for anything that isn't a number or a units object.
  // SIgnals the route to reject with a clear error.
  if (!i || typeof i !== 'object') {
    return null;
  }
  // Roll each larger unit down into the next, accumulating to milliseconds.
  const weeks = i.weeks || 0;
  const days = (i.days || 0) + weeks * 7;
  const hours = (i.hours || 0) + days * 24;
  const minutes = (i.minutes || 0) + hours * 60;
  const seconds = (i.seconds || 0) + minutes * 60;
  return (i.milliseconds || 0) + seconds * 1000;
}
