'use strict';
var https = require('https');
var url = require('url');

module.exports = function (apiKey) {
  return function (opts, cb) {
    var wrapper = {};
    wrapper.message = opts;
    wrapper.key = apiKey;
    var buff = new Buffer(JSON.stringify(wrapper));
    var httpOptions = url.parse('https://mandrillapp.com/api/1.0/messages/send.json');
    httpOptions.method = 'post';
    var req = https.request(httpOptions, function (res) {
      var data = '';
      res.on('error',cb).on('data', function (d) {
        data += d.toString();
      }).on('end', function () {
        cb(null, data);
      });
    });
    req.on('error', cb);
    req.write(buff);
    req.end();
  };
};