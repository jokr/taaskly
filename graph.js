'use strict';

const crypto = require('crypto');
const logger = require('heroku-logger')
const request = require('request-promise-native');

const baseURL = 'https://graph.facebook.com';

class GraphRequest {
  constructor(path) {
    this.path = path;
  }

  post() {
    this.method = 'POST';
    return this;
  }

  delete() {
    this.method = 'DELETE';
    return this;
  }

  token(token) {
    this.accessToken = token;
    this.sign = true;
    return this;
  }

  appSecret() {
    this.accessToken = process.env.APP_ID + '|' + process.env.APP_SECRET;
    this.sign = false;
    return this;
  }

  qs(qs) {
    this.queryString = qs;
    return this;
  }

  body(body) {
    this.contentBody = body;
    return this;
  }

  send() {
    let options = {
      method: this.method || 'GET',
      uri: `${baseURL}/v3.0/${this.path}`,
      qs: Object.assign(this._calcProof(), this.queryString || {}),
      json: true,
      resolveWithFullResponse: true,
    };

    if (this.accessToken) {
      options.headers = { Authorization: `Bearer ${this.accessToken}` };
    }

    if ((this.method === 'POST' || this.method === 'DELETE') && this.contentBody) {
      options.body = this.contentBody;
    }

    logger.info('sending request', options);
    return request(options)
      .then(result => {
        logger.info('api response', {code: result.statusCode, body: result.body});
        return result.body;
      })
      .catch(result => {
        logger.warn('api error', {code: result.statusCode, body: result.body});
        throw new Error(result.message);
      });
  }

  _calcProof() {
    if (!this.sign) {
      return {};
    }

    const appsecretTime = Math.floor(Date.now() / 1000) - 5;
    const appsecretProof = crypto
      .createHmac('sha256', process.env.APP_SECRET)
      .update(this.accessToken + '|' + appsecretTime)
      .digest('hex');
    return {
      appsecret_proof: appsecretProof,
      appsecret_time: appsecretTime
    };
  }
}

function graph(path) {
  return new GraphRequest(path);
}

module.exports = graph;
