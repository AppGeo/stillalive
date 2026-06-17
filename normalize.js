'use strict';

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
//
// Legacy Mandrill-style fields (from_email/from_name and a to array of
// { email, name, type }) are also accepted so existing payloads keep working.

function parseAddress(input) {
  if (!input) {
    return null;
  }
  if (typeof input === 'string') {
    var match = input.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
    if (match) {
      return { email: match[2].trim(), name: match[1] || undefined };
    }
    return { email: input.trim() };
  }
  if (typeof input === 'object') {
    var email = input.email || input.address;
    if (!email) {
      return null;
    }
    return { email: email, name: input.name };
  }
  return null;
}

function parseAddressList(input) {
  if (input === undefined || input === null) {
    return [];
  }
  var list = Array.isArray(input) ? input : [input];
  return list.map(parseAddress).filter(Boolean);
}

function normalizeEmail(email) {
  email = email || {};
  var from;
  if (email.from !== undefined) {
    from = email.from;
  } else if (email.from_email) {
    from = { email: email.from_email, name: email.from_name };
  }
  return {
    from: parseAddress(from),
    to: parseAddressList(email.to),
    cc: parseAddressList(email.cc),
    bcc: parseAddressList(email.bcc),
    replyTo: parseAddress(email.replyTo || email.reply_to),
    subject: email.subject,
    text: email.text,
    html: email.html
  };
}

function setBody(msg, n) {
  if (n.text !== undefined) {
    msg.text = n.text;
  }
  if (n.html !== undefined) {
    msg.html = n.html;
  }
  return msg;
}

// "Name <email>" or "email" (Resend, and a valid nodemailer form).
function asString(addr) {
  if (!addr) {
    return undefined;
  }
  return addr.name ? addr.name + ' <' + addr.email + '>' : addr.email;
}

// nodemailer address object form.
function asNodemailer(addr) {
  if (!addr) {
    return undefined;
  }
  return addr.name ? { name: addr.name, address: addr.email } : addr.email;
}

// SendGrid EmailData form.
function asSendgrid(addr) {
  if (!addr) {
    return undefined;
  }
  return addr.name ? { name: addr.name, email: addr.email } : addr.email;
}

function tagType(type) {
  return function (addr) {
    var out = { email: addr.email, type: type };
    if (addr.name) {
      out.name = addr.name;
    }
    return out;
  };
}

function toMandrill(n) {
  var to = []
    .concat(n.to.map(tagType('to')))
    .concat(n.cc.map(tagType('cc')))
    .concat(n.bcc.map(tagType('bcc')));
  var msg = { to: to, subject: n.subject };
  if (n.from) {
    msg.from_email = n.from.email;
    if (n.from.name) {
      msg.from_name = n.from.name;
    }
  }
  return setBody(msg, n);
}

function toNodemailer(n) {
  var msg = { from: asNodemailer(n.from), to: n.to.map(asNodemailer), subject: n.subject };
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
}

function toResend(n) {
  var msg = { from: asString(n.from), to: n.to.map(asString), subject: n.subject };
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
}

function toSendgrid(n) {
  var msg = { from: asSendgrid(n.from), to: n.to.map(asSendgrid), subject: n.subject };
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
}

module.exports = {
  normalizeEmail: normalizeEmail,
  toMandrill: function (email) {
    return toMandrill(normalizeEmail(email));
  },
  toNodemailer: function (email) {
    return toNodemailer(normalizeEmail(email));
  },
  toResend: function (email) {
    return toResend(normalizeEmail(email));
  },
  toSendgrid: function (email) {
    return toSendgrid(normalizeEmail(email));
  }
};
