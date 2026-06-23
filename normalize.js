// A single canonical email shape is accepted from callers regardless of the
// configured provider, then mapped to each provider's native format. This keeps
// the public request body identical across SMTP, Mandrill, Resend and SendGrid.
//
// Canonical input (all address fields accept a string, a { email, name } object,
// or an array of either; strings may use "Name <email>" form):
//
//   {
//     from:     "you@domain.tld" | { email, name },
//     to:       address | address[],
//     cc:       address | address[],   // optional
//     bcc:      address | address[],   // optional
//     replyTo:  address,               // optional
//     subject:  "subject line",
//     text:     "plain text body",     // text and/or html
//     html:     "<p>html body</p>"
//   }

// Parse a single address input into a normalized { email, name } object (or
// null when there is nothing usable). This is the one place that understands
// all the shorthand forms a caller might send, so the rest of the module can
// assume a consistent shape.
const parseAddress = (input) => {
  // Covers null, undefined, and empty string -- there is no address to parse.
  if (!input) {
    return null;
  }
  if (typeof input === 'string') {
    // String form. Accept both a bare address ("a@b.tld") and the RFC-style
    // "Display Name <a@b.tld>" form. The regex captures the optional display
    // name (group 1, non-greedy) and the address inside the angle brackets
    // (group 2). A non-match means it's a bare address.
    const match = input.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
    if (match) {
      return { email: match[2].trim(), name: match[1] || undefined };
    }
    return { email: input.trim() };
  }
  if (typeof input === 'object') {
    // Object form: { email, name }. Without an email there is nothing to send
    // to, so treat it as empty.
    const email = input.email;
    if (!email) {
      return null;
    }
    return { email: email, name: input.name };
  }
  // Any other type (number, boolean, etc.) is not a valid address.
  return null;
};

// Parse an address field that may be a single address or an array of them into
// a flat array of normalized { email, name } objects. Missing fields yield [].
const parseAddressList = (input) => {
  if (input === undefined || input === null) {
    return [];
  }
  // Wrap a lone address so the same map() handles both single and array input.
  const list = Array.isArray(input) ? input : [input];
  // filter(Boolean) drops any entries that parseAddress rejected (returned null).
  return list.map(parseAddress).filter(Boolean);
};

// Reduce a caller-supplied email object into the internal canonical shape that
// every to<Provider> mapper below consumes. All address fields become arrays or
// a single normalized object, so the mappers never have to re-handle shorthand.
const normalizeEmail = (email) => {
  email = email || {};
  return {
    from: parseAddress(email.from),
    to: parseAddressList(email.to),
    cc: parseAddressList(email.cc),
    bcc: parseAddressList(email.bcc),
    replyTo: parseAddress(email.replyTo),
    subject: email.subject,
    text: email.text,
    html: email.html
  };
};

// Copy whichever body parts are present onto a provider message. Shared by every
// mapper so the text/html handling stays identical across providers.
const setBody = (msg, n) => {
  if (n.text !== undefined) {
    msg.text = n.text;
  }
  if (n.html !== undefined) {
    msg.html = n.html;
  }
  return msg;
};

// The three as<Format> helpers below each render a normalized { email, name }
// into the exact address representation a given provider's SDK expects. Each
// returns undefined for a missing address so callers can leave the field unset.

// Resend (and nodemailer) accept a single string: "Name <email>" or just "email".
const asString = (addr) => {
  if (!addr) {
    return undefined;
  }
  return addr.name ? addr.name + ' <' + addr.email + '>' : addr.email;
};

// nodemailer's object form uses `address` (not `email`) for the email key.
const asNodemailer = (addr) => {
  if (!addr) {
    return undefined;
  }
  return addr.name ? { name: addr.name, address: addr.email } : addr.email;
};

// SendGrid's EmailData form uses `email` for the email key.
const asSendgrid = (addr) => {
  if (!addr) {
    return undefined;
  }
  return addr.name ? { name: addr.name, email: addr.email } : addr.email;
};

// Build a function that tags an address with a Mandrill recipient type
// ("to"/"cc"/"bcc"). Mandrill puts every recipient in one flat `to` array and
// distinguishes cc/bcc via this `type` field rather than separate arrays.
const tagType = (type) => (addr) => {
  const out = { email: addr.email, type: type };
  if (addr.name) {
    out.name = addr.name;
  }
  return out;
};

// Map the canonical email to Mandrill's message format. Note cc/bcc are merged
// into the single `to` array (tagged via type) and the sender is split into the
// separate from_email/from_name fields Mandrill expects.
const toMandrill = (n) => {
  const to = []
    .concat(n.to.map(tagType('to')))
    .concat(n.cc.map(tagType('cc')))
    .concat(n.bcc.map(tagType('bcc')));
  const msg = { to: to, subject: n.subject };
  if (n.from) {
    msg.from_email = n.from.email;
    if (n.from.name) {
      msg.from_name = n.from.name;
    }
  }
  return setBody(msg, n);
};

// Map the canonical email to nodemailer's sendMail options (used for SMTP).
// Optional fields are only set when present so we don't send empty arrays.
const toNodemailer = (n) => {
  const msg = { from: asNodemailer(n.from), to: n.to.map(asNodemailer), subject: n.subject };
  if (n.cc.length) {
    msg.cc = n.cc.map(asNodemailer);
  }
  if (n.bcc.length) {
    msg.bcc = n.bcc.map(asNodemailer);
  }
  if (n.replyTo) {
    msg.replyTo = asNodemailer(n.replyTo);
  }
  return setBody(msg, n);
};

// Map the canonical email to Resend's send() params. Resend takes string
// addresses and its SDK maps our `replyTo` to the wire's `reply_to`.
const toResend = (n) => {
  const msg = { from: asString(n.from), to: n.to.map(asString), subject: n.subject };
  if (n.cc.length) {
    msg.cc = n.cc.map(asString);
  }
  if (n.bcc.length) {
    msg.bcc = n.bcc.map(asString);
  }
  if (n.replyTo) {
    msg.replyTo = asString(n.replyTo);
  }
  return setBody(msg, n);
};

// Map the canonical email to SendGrid's MailData. SendGrid uses EmailData
// ({ email, name }) objects and accepts `replyTo` directly.
const toSendgrid = (n) => {
  const msg = { from: asSendgrid(n.from), to: n.to.map(asSendgrid), subject: n.subject };
  if (n.cc.length) {
    msg.cc = n.cc.map(asSendgrid);
  }
  if (n.bcc.length) {
    msg.bcc = n.bcc.map(asSendgrid);
  }
  if (n.replyTo) {
    msg.replyTo = asSendgrid(n.replyTo);
  }
  return setBody(msg, n);
};

// Pragmatic single-line address check: a non-empty local part, an "@", and a
// dotted domain, with no whitespace. Deliberately permissive -- it catches the
// common mistakes (missing "@", trailing spaces) without trying to reimplement
// the full RFC 5322 grammar.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isValidAddress = (addr) =>
  Boolean(addr) && typeof addr.email === 'string' && EMAIL_RE.test(addr.email);

// Validate a caller-supplied email payload, returning an array of human-readable
// error strings (empty when valid). Operates on the normalized shape so the same
// rules apply no matter which shorthand the caller used. Required: a valid
// `from`, at least one valid `to`, a non-empty `subject`, and `text` or `html`.
const validate = (email) => {
  const n = normalizeEmail(email);
  const errors = [];

  if (!isValidAddress(n.from)) {
    errors.push('`from` must be a valid email address');
  }
  if (n.to.length === 0) {
    errors.push('`to` must include at least one recipient');
  } else if (!n.to.every(isValidAddress)) {
    errors.push('every `to` address must be a valid email address');
  }
  for (const field of ['cc', 'bcc']) {
    if (n[field].length && !n[field].every(isValidAddress)) {
      errors.push(`every \`${field}\` address must be a valid email address`);
    }
  }
  if (n.replyTo && !isValidAddress(n.replyTo)) {
    errors.push('`replyTo` must be a valid email address');
  }
  if (typeof n.subject !== 'string' || n.subject.length === 0) {
    errors.push('`subject` must be a non-empty string');
  }
  if (!n.text && !n.html) {
    errors.push('either `text` or `html` body is required');
  }

  return errors;
};

// Public API: each to<Provider> entry normalizes the caller's email first, then
// maps it to that provider's native shape. normalizeEmail is also exported for
// callers/tests that want the intermediate canonical form.
const formatEmail = {
  normalizeEmail: normalizeEmail,
  validate: validate,
  toMandrill: (email) => toMandrill(normalizeEmail(email)),
  toNodemailer: (email) => toNodemailer(normalizeEmail(email)),
  toResend: (email) => toResend(normalizeEmail(email)),
  toSendgrid: (email) => toSendgrid(normalizeEmail(email))
};

export default formatEmail;
