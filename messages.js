'use strict';

const graph = require('./graph');

function defaultToken(token) {
  if (token !== null) {
    return Promise.resolve(token);
  } else if (process.env.ACCESS_TOKEN) {
    return Promise.resolve(process.env.ACCESS_TOKEN);
  } else {
    db.models.community.findOne()
    throw new Error("lookup of token from db not implemented");
  }
}

function postMessage(target, message, token) {
  const recipient = target.startsWith("t_") ?
  {
    thread_key: target
  } :
  {
    id: target
  };

  if (token === null) {
    token = defaultToken();
  }

  const messageData = {
    recipient: recipient,
    message: {
      text: message
    }
  };

  return defaultToken().then(token =>
    graph('me/messages')
      .post()
      .token(token)
      .body(messageData)
      .send());
}

module.exports = {
  postMessage: postMessage
};
