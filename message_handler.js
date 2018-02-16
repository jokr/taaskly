'use static';

const message_sender = require('./messages');

exports.handleSingleMessageEvent = function(messagingEvent) {
  const senderID = messagingEvent.thread ? messagingEvent.thread.id : messagingEvent.sender.id;

  if (messagingEvent.optin) {
    onReceiveAuthentication(senderID, messagingEvent);
  } else if (messagingEvent.message) {
    onReceiveMessage(senderID, messagingEvent);
  } else if (messagingEvent.delivery) {
    onReceiveDeliveryConfirmation(senderID, messagingEvent);
  } else if (messagingEvent.postback) {
    receivedPostback(senderID, messagingEvent);
  } else if (messagingEvent.read) {
    receivedMessageRead(senderID, messagingEvent);
  } else if (messagingEvent.account_linking) {
    receivedAccountLink(senderID, messagingEvent);
  } else {
    console.log('Webhook received unknown messagingEvent: ', messagingEvent);
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
  message_sender.postTextMessage(senderID, 'Received authorization event');
}

function onReceiveMessage(senderID, messagingEvent) {
  // extract message fields
  const message = messagingEvent.message;
  const messageText = message.text;
  const messageAttachments = message.attachments;
  const quickReply = message.quick_reply;
  const isEcho = message.is_echo;

  if (isEcho) {
    // no-op for echo messages
    console.log('received echo');
    return;
  }

  if (quickReply) {
    // TODO: this usually needs to be handled in the context of a conversation
    const quickReplyPayload = quickReply.payload;
    const stringifiedPayload = JSON.stringify(quickReplyPayload);
    console.log('received quick reply with payload: %s', stringifiedPayload);
    message_sender.postTextMessage(senderID, 'Received quick reply: ' + stringifiedPayload);
    return;
  }

  if (messageAttachments) {
    // TODO: this needs more complicated unpacking
    const stringifiedAttachments = JSON.stringify(messageAttachments);
    console.log('received attachments with payload: %s', stringifiedAttachments);
    message_sender.postTextMessage(senderID, 'Received attachments: ' + stringifiedAttachments);
    return;
  }

  if (messageText) {
    // process cleaned up message text as commands
    onReceiveCommand(senderID, messageText.replace(/[^\w\s]/gi, '').trim().toLowerCase());
  }
}

function onReceiveCommand(senderID, messageText) {
  switch (messageText) {
    case 'hello':
    case 'hi':
      message_sender.postTextMessage(senderID, 'Hi there! Type "help" to check out the full list of commands');
      break;
    case 'help':
      message_sender.postTextMessage(senderID, 'help command');
      break;
    case 'button':
      sendButtonMessage(senderID);
      break;
    case 'quick reply':
      sendQuickReplyMessage(senderID);
      break;
    default:
      message_sender.postTextMessage(senderID, 'Did you just say ' + messageText + '?');
      break;
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
  message_sender.postMessage(senderID, messageData);
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
  message_sender.postMessage(senderID, messageData);
}

function onReceiveDeliveryConfirmation(senderID, messagingEvent) {
  console.log('onReceiveDeliveryConfirmation from %s with data %s', senderID, JSON.stringify(messagingEvent));
}

function onReceivePostback(senderID, messagingEvent) {
  console.log('onReceivePostback from %s with data %s', senderID, JSON.stringify(messagingEvent));
}
