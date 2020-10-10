#!/usr/bin/env node
/* eslint-disable no-console */

const openurl = require('openurl');
const yargs = require('yargs');
const axios = require('axios');

const localtunnel = require('../anttunnel');
const { version } = require('../package');

const { argv } = yargs
  .usage('Usage: anttunnel --port [num] <options>')
  .env(true)
  .option('p', {
    alias: 'port',
    describe: 'Internal HTTP server port',
  })
  .option('s', {
    alias: 'subdomain',
    describe: 'Request this subdomain',
  })
  .option('d', {
    alias: 'domain',
    describe: 'Request a domain, Options: ant-tunnel.com anttunnel.com opentun.nl gametun.nl webtun.nl',
  })
  .option('l', {
    alias: 'local-host',
    describe: 'Tunnel traffic to this host instead of localhost, override Host header to this host',
  })
  .option('r', {
    alias: 'region',
    describe: 'Region for the tunnel, Options - SFO, FRA, BLR, NYC',
    default: 'SFO',
  })
  .option('local-https', {
    describe: 'Tunnel traffic to a local HTTPS server',
  })
  .option('local-cert', {
    describe: 'Path to certificate PEM file for local HTTPS server',
  })
  .option('local-key', {
    describe: 'Path to certificate key file for local HTTPS server',
  })
  .option('local-ca', {
    describe: 'Path to certificate authority file for self-signed certificates',
  })
  .option('allow-invalid-cert', {
    describe: 'Disable certificate checks for your local HTTPS server (ignore cert/key/ca options)',
  })
  .options('o', {
    alias: 'open',
    describe: 'Opens the tunnel URL in your browser',
  })
  .option('print-requests', {
    describe: 'Print basic request info',
  })
  .require('port')
  .boolean('local-https')
  .boolean('allow-invalid-cert')
  .boolean('print-requests')
  .help('help', 'Show this help and exit')
  .version(version);

if (typeof argv.port !== 'number') {
  yargs.showHelp();
  console.error('\nInvalid argument: `port` must be a number');
  process.exit(1);
}

(async () => {
  const tunnel = await localtunnel({
    port: argv.port,
    host: '',
    region: argv.region,
    domain: argv.domain,
    subdomain: argv.subdomain,
    local_host: argv.localHost,
    local_https: argv.localHttps,
    local_cert: argv.localCert,
    local_key: argv.localKey,
    local_ca: argv.localCa,
    allow_invalid_cert: argv.allowInvalidCert,
  }).catch(err => {
    throw err;
  });

  tunnel.on('error', err => {
    throw err;
  });

  console.log('http tunnel is ready: %s', tunnel.url);
  /*console.log('Setting up https tunnel... (this might take up to 30 seconds)');
  const urlWithoutProtocol = new URL(tunnel.url).host;
  //get https tunnel
  try
  {
    var httpsUrl = "https://"+urlWithoutProtocol;
    await axios.get(httpsUrl);
    
  } catch (e) {
    
  }
  console.log('https tunnel is ready: %s', httpsUrl);*/

  if (argv.open) {
    openurl.open(tunnel.url);
  }

  if (argv['print-requests']) {
    tunnel.on('request', info => {
      console.log(new Date().toString(), info.method, info.path);
    });
  }
})();
