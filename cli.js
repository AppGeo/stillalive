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
  switch (len) {
    case 3: return mail(config);
    case 4: return mail(config, process.argv[3]);
    default: throw new TypeError('wrong number of arguments');
  }
});
