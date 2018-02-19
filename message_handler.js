'use static';

const db = require('./db');
const messageSender = require('./messages');
const url = require('url');

exports.handleSingleMessageEvent = function(req, messagingEvent) {
  const senderID = messagingEvent.thread ? messagingEvent.thread.id : messagingEvent.sender.id;
  // TODO: only Page ID is sent back, need logic to convert to AppID, hardcode for now
  const appID = process.env.APP_ID;
  const host = req.get('host');

  return db.models.community.findById(parseInt(appID)).then(community => {
    // in case this is configured as a custom integration, get token from env variable
    const token = community ? community.accessToken : process.env.ACCESS_TOKEN;
    if (token) {
      const appEnv = {
        appID: appID,
        token: token,
        host: host,
      };
      if (messagingEvent.optin) {
        return onReceiveAuthentication(senderID, messagingEvent, appEnv);
      } else if (messagingEvent.message) {
        return onReceiveMessage(senderID, messagingEvent, appEnv);
      } else if (messagingEvent.delivery) {
        return onReceiveDeliveryConfirmation(senderID, messagingEvent, appEnv);
      } else if (messagingEvent.postback) {
        return receivedPostback(senderID, messagingEvent, appEnv);
      } else if (messagingEvent.read) {
        return receivedMessageRead(senderID, messagingEvent, appEnv);
      } else if (messagingEvent.account_linking) {
        return receivedAccountLink(senderID, messagingEvent, appEnv);
      } else {
        console.log('Webhook received unknown messagingEvent: ', messagingEvent);
      }
    } else {
      console.log('No access token exists for this app');
    }
    return Promise.resolve();
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
function onReceiveAuthentication(senderID, messagingEvent, appEnv) {
  // TODO: add handling of Account linking Event
  return messageSender.postTextMessage(senderID, 'Received authorization event', appEnv.token);
}

function onReceiveDeliveryConfirmation(senderID, messagingEvent) {
  console.log('onReceiveDeliveryConfirmation from %s with data %s', senderID, JSON.stringify(messagingEvent));
  return Promise.resolve();
}

function onReceivePostback(senderID, messagingEvent) {
  console.log('onReceivePostback from %s with data %s', senderID, JSON.stringify(messagingEvent));
  return Promise.resolve();
}

function onReceiveMessage(senderID, messagingEvent, appEnv) {
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
    return messageSender.postTextMessage(senderID, 'Received quick reply: ' + stringifiedPayload, appEnv.token);
  }

  if (messageAttachments) {
    // TODO: this needs more complicated unpacking
    const stringifiedAttachments = JSON.stringify(messageAttachments);
    console.log('received attachments with payload: %s', stringifiedAttachments);
    return messageSender.postTextMessage(senderID, 'Received attachments: ' + stringifiedAttachments, appEnv.token);
  }

  if (messageText) {
    handleTextMessage(senderID, messageText, appEnv);
  }

  // not any of the above
  return Promise.resolve();
}

function handleTextMessage(senderID, messageText, appEnv) {
  switch (messageText.replace(/[^\w\s]/gi, '').trim().toLowerCase()) {
    case 'hi':
    case 'hey':
    case 'hello':
      return sendGreetingMessage(senderID, appEnv);
    case 'help':
      return sendHelpMessage(senderID, appEnv);
    case 'button':
      return sendButton(senderID, appEnv);
    case 'quick reply':
      return sendQuickReply(senderID, appEnv);
    case 'extension':
      return sendExtension(senderID, appEnv);
    default:
      return messageSender.postTextMessage(senderID, 'Did you just say ' + messageText + '? Try "help" to find the list of commands supported!', appEnv.token);
  }
}

function sendGreetingMessage(senderID, appEnv) {
  return messageSender.postTextMessage(senderID, 'Hi there! Type "help" to check out the full list of commands', appEnv.token);
}

function sendHelpMessage(senderID, appEnv) {
  return messageSender.postTextMessage(
    senderID, '`hi             Greeting from Pusheen`\n\
`help           The command you are seeing right now`\n\
`button         Send Button Template`\n\
`quick reply    Send Quick Reply`\n\
`extension      Send a web button with Extension SDK integrated`',
    appEnv.token
  );
}

function sendButton(senderID, appEnv) {
  return messageSender.postMessage(
    senderID,
    {
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
    },
    appEnv.token
  );
}

function sendQuickReply(senderID, appEnv) {
  return messageSender.postMessage(
    senderID,
    {
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
    },
    appEnv.token
  );
}

function sendExtension(senderID, appEnv) {
  const extensionURL = url.format({
      protocol: 'https',
      host: appEnv.host,
      pathname: 'extension',
      search: 'appID=' + appEnv.appID,
  });
  return messageSender.postMessage(
    senderID,
    {
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text: "Web page with Extension SDK enabled",
            buttons:[{
              type: "web_url",
              messenger_extensions: true,
              url: extensionURL,
              title: "This is a title",
              webview_height_ratio: "tall"
            }]
          }
        }
      }
    },
    appEnv.token
  );
}
