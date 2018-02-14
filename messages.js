'use strict';

const logger = require('heroku-logger')
const request = require('request-promise');

const graph = require('./graph');

function token() {
  if (process.env.ACCESS_TOKEN) {
    return process.env.ACCESS_TOKEN;
  } else {
    throw new Error("lookup of token from db not implemented");
  }
}

function postMessage(target, message) {
  const recipient = target.startsWith("t_") ?
  {
    thread_key: target
  } :
  {
    id: target
  };

  const messageData = {
    recipient: recipient,
    message: {
      text: message
    }
  };

  return graph('me/messages')
    .post()
    .token(token())
    .body(messageData)
    .send();
}

module.exports = {
  postMessage: postMessage
};
