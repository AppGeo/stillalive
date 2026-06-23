import { createHash, timingSafeEqual } from 'node:crypto';

import express from 'express';
import morgan from 'morgan';

import createSender from './send.js';
import formatEmail from './normalize.js';

// Exported factory: starts an Express "dead man's switch" server.
//   key         - shared secret callers must present to arm/clear timeouts
//   emailConfig - provider config passed to ./send (selects SMTP/Mandrill/etc.)
//   listenPort  - optional port; falls back to PORT env var, then 3000
//
// Clients periodically PUT /still/alive/:id to (re)arm a per-id timer. If a
// client stops checking in, the timer fires and an alert email is sent.
export default async function createServer(key, emailConfig, listenPort) {
  if (typeof key !== 'string' || key.length === 0) {
    throw new TypeError('`key` must be a non-empty string.');
  }
  // Active timers keyed by id; each is replaced/cleared on the next check-in.
  const timeouts = new Map();
  const emailSender = await createSender(emailConfig);
  const verifyKey = createKeyVerifier(key);
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
    const body = req.body ?? {};
    if (!verifyKey(body.key)) {
      return res.status(400).json({ error: 'bad request' });
    }

    // Validate the alert payload now so the caller gets immediate feedback
    // instead of the email failing silently when the timer eventually fires.
    const emailErrors = formatEmail.validate(body.email);
    if (emailErrors.length) {
      return res.status(400).json({ error: 'invalid email', details: emailErrors });
    }

    // Reject an unusable interval up front
    const ms = toMilliseconds(body.interval);
    if (!Number.isFinite(ms) || ms < 0) {
      return res.status(400).json({ error: 'invalid interval' });
    }

    const { id } = req.params;
    // Cancel any existing timer for this id so we restart the countdown clean.
    if (timeouts.has(id)) {
      clearTimeout(timeouts.get(id).timer);
      timeouts.delete(id);
    }

    // Schedule the alert. If this id checks in again first, the timer above is
    // cleared and this callback never runs. We also record when it will fire so
    // the /active route can report each timer's remaining time.
    timeouts.set(id, {
      expiresAt: Date.now() + ms,
      timer: setTimeout(() => {
        sendEmail(body.email);
        timeouts.delete(id);
      }, ms),
    });

    res.json({ 'timeout set': body.interval });
  });

  // Manually cancel a pending timer for :id (e.g. on a clean shutdown).
  app.put('/clear/:id', (req, res) => {
    const body = req.body ?? {};
    if (!verifyKey(body.key)) {
      return res.status(400).json({ error: 'bad request' });
    }

    const { id } = req.params;
    if (timeouts.has(id)) {
      clearTimeout(timeouts.get(id).timer);
      timeouts.delete(id);
      return res.json({ cleared: true });
    }
    res.status(400).json({ error: 'no such timeout' });
  });

  // List every currently-armed watchdog timer with its id and when it will
  // fire. Protected by the shared key, sent in the body like the other routes.
  app.post('/active', (req, res) => {
    const body = req.body ?? {};
    if (!verifyKey(body.key)) {
      return res.status(400).json({ error: 'bad request' });
    }

    const now = Date.now();
    const active = Array.from(timeouts, ([id, timeout]) => ({
      id,
      expiresAt: new Date(timeout.expiresAt).toISOString(),
      msRemaining: Math.max(0, timeout.expiresAt - now),
    }));
    res.json({ active });
  });

  console.log(`app is listening on ${port}`);
  app.listen(port);

  return app;
}

// Build a comparator that checks a supplied key against the configured one.
// Both keys are hashed to a fixed-length digest and compared with
// crypto.timingSafeEqual, so the check is constant-time (no key leak via timing
// analysis) and -- because the digests are always the same length -- it neither
// throws nor reveals the key's length.
function createKeyVerifier(origKey) {
  const origHash = createHash('sha256').update(origKey).digest();

  return (compare) => {
    // A missing or non-string key can't match; treat it as a failed auth
    // (handled as a 400 by the route) rather than letting the hash throw.
    if (typeof compare !== 'string') {
      return false;
    }
    const compHash = createHash('sha256').update(compare).digest();
    return timingSafeEqual(origHash, compHash);
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
  // Signals the route to reject with a clear error.
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
