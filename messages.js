'use strict';

const graph = require('./graph');

function defaultToken(token) {
  if (token !== null) {
    return Promise.resolve(token);
  } else if (process.env.ACCESS_TOKEN) {
    // TODO refactor make this a pure function
    return Promise.resolve(process.env.ACCESS_TOKEN);
  } else {
    return db.models.community.findOne().then(communityToken => communityToken.accessToken);
  }
}

function postMessage(target, messageData, token) {
  messageData['recipient'] = target.startsWith("t_") ?
  {
    thread_key: target
  } :
  {
    id: target
  };

  return defaultToken(token).then(resolvedToken =>
  	 graph('me/messages')
      .post()
      .token(resolvedToken)
      .body(messageData)
      .send());
}

function postTextMessage(target, message, token) {
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
