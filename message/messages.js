'use strict';

const graph = require.main.require('./graph');
const db = require.main.require('./db');

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
  if (Array.isArray(target)) {
    messageData['recipient'] = { ids: target }
  } else if (target.startsWith("t_")) {
    messageData['recipient'] = { thread_key: target }
  } else {
    messageData['recipient'] = { id: target }
  }

  return defaultToken(token).then(resolvedToken =>
  	 graph('me/messages')
      .post()
      .token(resolvedToken)
      .body(messageData)
      .send());
}

function renameThread(thread, newName, token) {
  return defaultToken(token).then(resolvedToken =>
  	 graph(thread + '/threadname')
      .post()
      .token(resolvedToken)
      .body({name: newName})
      .send());
}

function addToGroup(thread, recipients, token) {
  return defaultToken(token).then(resolvedToken =>
  	 graph(thread + '/participants')
      .post()
      .token(resolvedToken)
      .body({to: recipients})
      .send());
}

function removeFromGroup(thread, recipients, token) {
  return defaultToken(token).then(resolvedToken =>
  	 graph(thread + '/participants')
      .delete()
      .token(resolvedToken)
      .body({to: recipients})
      .send());
}

function postTextMessage(target, message, token) {
  const messageData = {
    message: {
      text: message
    }
  };

  return postMessage(target, messageData, token);
}

function inbox(token) {
  return defaultToken(token).then(resolvedToken =>
    graph('me/threads?fields=participants,name')
      .token(resolvedToken)
      .send()).then(response => response.data);
}

module.exports = {
  postMessage: postMessage,
  postTextMessage: postTextMessage,
  renameThread: renameThread,
  addToGroup: addToGroup,
  removeFromGroup: removeFromGroup,
  inbox: inbox,
};
