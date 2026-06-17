#!/usr/bin/env node
'use strict';
var path = require('path');
var mail = require('./server');
var fs = require('fs');
var configPath = path.resolve(process.argv[2]);
var len = process.argv.length;
fs.readFile(configPath, function (err, resp) {
  if (err) {
    throw err;
  }
  var config = JSON.parse(resp.toString());
  // The email provider config lives under `provider`. `smtp`/`api` are accepted
  // as fallbacks so config files written for older versions keep working.
  var providerConfig = config.provider || config.smtp || config.api;
  switch (len) {
    case 3: return mail(config.key, providerConfig);
    case 4: return mail(config.key, providerConfig, process.argv[3]);
    default: throw new TypeError('wrong number of arguments');
  }
});
