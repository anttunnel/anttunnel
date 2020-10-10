/* eslint-disable consistent-return, no-underscore-dangle */

const { parse } = require('url');
const { EventEmitter } = require('events');
const axios = require('axios');
const debug = require('debug')('anttunnel:client');

const TunnelCluster = require('./TunnelCluster');

module.exports = class Tunnel extends EventEmitter {
  constructor(opts = {}) {
    super(opts);
    this.opts = opts;
    this.closed = false;
    if (!this.opts.host) {
      this.opts.host = 'https://ant-tunnel.com';
    }
  }

  _getInfo(body, server_ip) {
    /* eslint-disable camelcase */
    const { id, ip, port, url, cached_url, max_conn_count } = body;
    const { host, port: local_port, local_host, region, domain } = this.opts;
    const { local_https, local_cert, local_key, local_ca, allow_invalid_cert } = this.opts;
    return {
      name: id,
      url,
      region,
      domain,
      cached_url,
      max_conn: max_conn_count || 1,
      remote_host: server_ip,
      remote_ip: ip,
      remote_port: port,
      local_port,
      local_host,
      local_https,
      local_cert,
      local_key,
      local_ca,
      allow_invalid_cert,
    };
    /* eslint-enable camelcase */
  }

  // initialize connection
  // callback with connection info
  _init(cb) {
    const opt = this.opts;
    const getInfo = this._getInfo.bind(this);

    const params = {
      responseType: 'json',
    };

    // no subdomain at first, maybe use requested domain
    const assignedDomain = opt.subdomain + '?tunnel=1';
    
    //get ip to connect
    axios.get("https://20rx8o1hoa.execute-api.us-west-2.amazonaws.com/get-ip?region="+opt.region, params).then(res => {
          const server_ip = res.data.ip;
          // where to quest
          const uri = 'http://' + server_ip + '/' +  (assignedDomain || '?new') + "&domain="+opt.domain;
          (function getUrl() {
            axios
              .get(uri, params)
              .then(res => {
                const body = res.data;
                //console.log('got tunnel information', res.data);
                if (res.status !== 200) {
                  const err = new Error(
                    (body && body.message) || 'anttunnel server returned an error, please try again'
                  );
                  return cb(err);
                }
                cb(null, getInfo(body, server_ip));
              })
              .catch(err => {
                if (err.response && err.response.status && err.response.status == 406) {
                  console.log(err.response.data);
                  return;
                }
                console.log(`anttunnel server offline: ${err.message}, retry in 2s`);
                return setTimeout(getUrl, 2000);
              });
          })();
        })
        .catch(err => {
          if (err.response.status == 406) {
            console.log(err.response.data);
          }
          debug(`tunnel server offline: ${err.message}`);
        });

  }

  _establish(info) {
    // increase max event listeners so that anttunnel consumers don't get
    // warning messages as soon as they setup even one listener. See #71
    this.setMaxListeners(info.max_conn + (EventEmitter.defaultMaxListeners || 10));

    this.tunnelCluster = new TunnelCluster(info);

    // only emit the url the first time
    this.tunnelCluster.once('open', () => {
      this.emit('url', info.url);
    });

    // re-emit socket error
    this.tunnelCluster.on('error', err => {
      debug('got socket error', err.message);
      this.emit('error', err);
    });

    let tunnelCount = 0;

    // track open count
    this.tunnelCluster.on('open', tunnel => {
      tunnelCount++;
      debug('anttunnel open [total: %d]', tunnelCount);

      const closeHandler = () => {
        tunnel.destroy();
      };

      if (this.closed) {
        return closeHandler();
      }

      this.once('close', closeHandler);
      tunnel.once('close', () => {
        this.removeListener('close', closeHandler);
      });
    });

    // when a tunnel dies, open a new one
    this.tunnelCluster.on('dead', () => {
      tunnelCount--;
      debug('anttunnel dead [total: %d]', tunnelCount);
      if (this.closed) {
        return;
      }
      this.tunnelCluster.open();
    });

    this.tunnelCluster.on('request', req => {
      this.emit('request', req);
    });

    // establish as many tunnels as allowed
    for (let count = 0; count < info.max_conn; ++count) {
      this.tunnelCluster.open();
    }
  }

  open(cb) {
    this._init((err, info) => {
      if (err) {
        return cb(err);
      }

      this.clientId = info.name;
      this.url = info.url;

      // `cached_url` is only returned by proxy servers that support resource caching.
      if (info.cached_url) {
        this.cachedUrl = info.cached_url;
      }

      this._establish(info);
      cb();
    });
  }

  close() {
    this.closed = true;
    this.emit('close');
  }
};
