'use static';

const message_sender = require('./messages');
const db = require('./db');

exports.handleSingleMessageEvent = function(messagingEvent) {
  const senderID = messagingEvent.thread ? messagingEvent.thread.id : messagingEvent.sender.id;

  if (messagingEvent.optin) {
    return onReceiveAuthentication(senderID, messagingEvent);
  } else if (messagingEvent.message) {
    return onReceiveMessage(senderID, messagingEvent);
  } else if (messagingEvent.delivery) {
    return onReceiveDeliveryConfirmation(senderID, messagingEvent);
  } else if (messagingEvent.postback) {
    return receivedPostback(senderID, messagingEvent);
  } else if (messagingEvent.read) {
    return receivedMessageRead(senderID, messagingEvent);
  } else if (messagingEvent.account_linking) {
    return receivedAccountLink(senderID, messagingEvent);
  } else {
    console.log('Webhook received unknown messagingEvent: ', messagingEvent);
    return Promise.resolve();
  }
};

/*
 * Authorization Event
 *
 * The value for 'optin.ref' is defined in the entry point. For the "Send to
 * Messenger" plugin, it is the 'data-ref' field. Read more at
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/authentication
 *
 */
function onReceiveAuthentication(senderID, messagingEvent) {
  // TODO: add handling of Account linking Event
  return message_sender.postTextMessage(senderID, 'Received authorization event');
}

function onReceiveMessage(senderID, messagingEvent) {
  // extract message fields
  const message = messagingEvent.message;
  const messageText = message.text;
  const messageAttachments = message.attachments;
  const quickReply = message.quick_reply;
  const isEcho = message.is_echo;
  const community = messagingEvent.sender.community.id;

  const botToken = db.models.community.findOne().then(communityToken => communityToken ? communityToken.accessToken : null);

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
    return message_sender.postTextMessage(senderID, 'Received quick reply: ' + stringifiedPayload);
  }

  if (messageAttachments) {
    // TODO: this needs more complicated unpacking
    const stringifiedAttachments = JSON.stringify(messageAttachments);
    console.log('received attachments with payload: %s', stringifiedAttachments);
    return message_sender.postTextMessage(senderID, 'Received attachments: ' + stringifiedAttachments);
  }

  if (messageText) {
    // process cleaned up message text as commands
    return botToken.then(token =>
      onReceiveCommand(senderID, messageText.replace(/[^\w\s]/gi, '').trim().toLowerCase(), token)
    );
  }
}

function onReceiveCommand(senderID, messageText) {
  switch (messageText) {
    case 'hello':
    case 'hi':
      return message_sender.postTextMessage(senderID, 'Hi there! Type "help" to check out the full list of commands');
    case 'help':
      return message_sender.postTextMessage(senderID, 'help command');
    case 'button':
      return sendButtonMessage(senderID);
    case 'quick reply':
      return sendQuickReplyMessage(senderID);
    default:
      return message_sender.postTextMessage(senderID, 'Did you just say ' + messageText + '?');
  }
}

function sendButtonMessage(senderID) {
  var messageData = {
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "Message with buttons!",
          buttons:[{
            type: "web_url",
            url: "https://workplace.facebook.com",
            title: "Open Workplace"
          }, {
            type: "postback",
            title: "Trigger Postback",
            payload: "PAYLOAD"
          }, {
            type: "phone_number",
            title: "Call Phone Number",
            payload: "999"
          }]
        }
      }
    }
  };
  return message_sender.postMessage(senderID, messageData);
}

function sendQuickReplyMessage(senderID) {
  var messageData = {
    message: {
      text: "What's your favorite movie genre?",
      quick_replies: [
        {
          "content_type":"text",
          "title":"Action",
          "payload":"DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_ACTION"
        },
        {
          "content_type":"text",
          "title":"Comedy",
          "payload":"DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_COMEDY"
        },
        {
          "content_type":"text",
          "title":"Drama",
          "payload":"DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_DRAMA"
        }
      ]
    }
  };
  return message_sender.postMessage(senderID, messageData);
}

function onReceiveDeliveryConfirmation(senderID, messagingEvent) {
  console.log('onReceiveDeliveryConfirmation from %s with data %s', senderID, JSON.stringify(messagingEvent));
  return Promise.resolve();
}

function onReceivePostback(senderID, messagingEvent) {
  console.log('onReceivePostback from %s with data %s', senderID, JSON.stringify(messagingEvent));
  return Promise.resolve();
}
