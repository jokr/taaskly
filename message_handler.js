'use static';

const messageSender = require('./messages');
const db = require('./db');
const commandHander = require('./command_handler');

exports.handleSingleMessageEvent = function(messagingEvent) {
  const senderID = messagingEvent.thread ? messagingEvent.thread.id : messagingEvent.sender.id;
  const appID = messagingEvent.recipient.id;

  return db.models.community.findById(parseInt(appID)).then(community => {
    // in case this is configured as a custom integration, get token from env variable
    const token = community ? community.accessToken : process.env.ACCESS_TOKEN;
    if (token) {
      if (messagingEvent.optin) {
        return onReceiveAuthentication(senderID, messagingEvent, token);
      } else if (messagingEvent.message) {
        return onReceiveMessage(senderID, messagingEvent, token);
      } else if (messagingEvent.delivery) {
        return onReceiveDeliveryConfirmation(senderID, messagingEvent, token);
      } else if (messagingEvent.postback) {
        return receivedPostback(senderID, messagingEvent, token);
      } else if (messagingEvent.read) {
        return receivedMessageRead(senderID, messagingEvent, token);
      } else if (messagingEvent.account_linking) {
        return receivedAccountLink(senderID, messagingEvent, token);
      } else {
        console.log('Webhook received unknown messagingEvent: ', messagingEvent);
        return Promise.resolve();
      }
    }
  });
};

/*
 * Authorization Event
 *
 * The value for 'optin.ref' is defined in the entry point. For the "Send to
 * Messenger" plugin, it is the 'data-ref' field. Read more at
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/authentication
 *
 */
function onReceiveAuthentication(senderID, messagingEvent, token) {
  // TODO: add handling of Account linking Event
  return messageSender.postTextMessage(senderID, 'Received authorization event', token);
}

function onReceiveMessage(senderID, messagingEvent, token) {
  // extract message fields
  const message = messagingEvent.message;
  const messageText = message.text;
  const messageAttachments = message.attachments;
  const quickReply = message.quick_reply;
  const isEcho = message.is_echo;
  const community = messagingEvent.sender.community.id;

  if (isEcho) {
    // no-op for echo messages
    console.log('received echo');
    return Promise.resolve();
  }

  if (quickReply) {
    // TODO: this usually needs to be handled in the context of a conversation
    const quickReplyPayload = quickReply.payload;
    const stringifiedPayload = JSON.stringify(quickReplyPayload);
    console.log('received quick reply with payload: %s', stringifiedPayload);
    return messageSender.postTextMessage(senderID, 'Received quick reply: ' + stringifiedPayload, token);
  }

  if (messageAttachments) {
    // TODO: this needs more complicated unpacking
    const stringifiedAttachments = JSON.stringify(messageAttachments);
    console.log('received attachments with payload: %s', stringifiedAttachments);
    return messageSender.postTextMessage(senderID, 'Received attachments: ' + stringifiedAttachments, token);
  }

  if (messageText) {
    // process cleaned up message text as commands
    const handleCommandPromise = commandHander.handleCommand(senderID, messageText.replace(/[^\w\s]/gi, '').trim().toLowerCase(), token);
    if (handleCommandPromise) {
      return handleCommandPromise;
    }
    return messageSender.postTextMessage(senderID, 'Did you just say ' + messageText + '? Try "help" to find the list of commands supported!', token);
  }
}

function onReceiveDeliveryConfirmation(senderID, messagingEvent) {
  console.log('onReceiveDeliveryConfirmation from %s with data %s', senderID, JSON.stringify(messagingEvent));
  return Promise.resolve();
}

function onReceivePostback(senderID, messagingEvent) {
  console.log('onReceivePostback from %s with data %s', senderID, JSON.stringify(messagingEvent));
  return Promise.resolve();
}
