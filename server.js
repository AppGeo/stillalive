var express = require('express');
var morgan  = require('morgan');
var bodyParser = require('body-parser');
var nodemailer = require("nodemailer");
var interval = require('interval');
var config = require('./config.json');
var mandrill = nodemailer.createTransport("Mandrill", config.smtp);
var app = express();
app.use(morgan('dev'));
app.use(bodyParser());
var port = process.env.PORT || 7027;
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
    clearTimeout(config.timeouts[req.params.id]);
    delete config.timeouts[req.params.id];
  }
  console.log('setting timeout for ', req.body.interval);
  config.timeouts[req.params.id] = setTimeout(function () {
    sendEmail(req.body.email);
    delete config.timeouts[req.params.id]; 
  }, interval(req.body.interval));
  res.json({ok: true});
});

console.log('app is listening on ' + port);
app.listen(port);