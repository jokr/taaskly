'use strict';

const graph = require('./graph');

function token() {
  if (process.env.ACCESS_TOKEN) {
    return process.env.ACCESS_TOKEN;
  } else {
    throw new Error("lookup of token from db not implemented");
  }
}

function postMessage(target, messageData) {
  messageData['recipient'] = target.startsWith("t_") ?
  {
    thread_key: target
  } :
  {
    id: target
  };

  return graph('me/messages')
    .post()
    .token(token())
    .body(messageData)
    .send();
}

function postTextMessage(target, message) {
  const messageData = {
    message: {
      text: message
    }
  };

  return postMessage(target, messageData);
}

module.exports = {
  postMessage: postMessage,
  postTextMessage: postTextMessage,
};
