'use static';

const db = require('./db');
const messageSender = require('./messages');
const url = require('url');

exports.handleSingleMessageEvent = function(req, messagingEvent) {
  const senderID = messagingEvent.thread ? messagingEvent.thread.id : messagingEvent.sender.id;
  const communityID = messagingEvent.sender.community.id;

  return db.models.community.findById(parseInt(communityID)).then(community => {
    // in case this is configured as a custom integration, get token from env variable
    const token = community ? community.accessToken : process.env.ACCESS_TOKEN;
    if (token) {
      const appEnv = {
        appID: process.env.APP_ID,
        token: token,
        host: req.get('host'),
      };
      if (messagingEvent.optin) {
        return onReceiveAuthentication(senderID, messagingEvent, appEnv);
      } else if (messagingEvent.message) {
        return onReceiveMessage(senderID, messagingEvent, appEnv);
      } else if (messagingEvent.delivery) {
        return onReceiveDeliveryConfirmation(senderID, messagingEvent, appEnv);
      } else if (messagingEvent.postback) {
        return onReceivePostback(senderID, messagingEvent, appEnv);
      } else if (messagingEvent.read) {
        return onReceiveMessageRead(senderID, messagingEvent, appEnv);
      } else if (messagingEvent.account_linking) {
        return onReceiveAccountLink(senderID, messagingEvent, appEnv);
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

function onReceiveDeliveryConfirmation(senderID, messagingEvent, appEnv) {
  console.log('onReceiveDeliveryConfirmation from %s with data %s', senderID, JSON.stringify(messagingEvent));
  return Promise.resolve();
}

function onReceivePostback(senderID, messagingEvent, appEnv) {
  console.log('onReceivePostback from %s with data %s', senderID, JSON.stringify(messagingEvent));
  return Promise.resolve();
}

function onReceiveMessageRead(senderID, messagingEvent, appEnv) {
  console.log('onReceiveMessageRead from %s with data %s', senderID, JSON.stringify(messagingEvent));
  return Promise.resolve();
}

function onReceiveAccountLink(senderID, messagingEvent, appEnv) {
  console.log('onReceiveAccountLink from %s with data %s', senderID, JSON.stringify(messagingEvent));
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
  var command = messageText.replace(/[^\w\s]/gi, '').replace(/\s+/, ' ').trim().toLowerCase();
  var items = command.split(' ');
  switch (command) {
    case 'hi':
    case 'hey':
    case 'hello':
      return sendGreetingMessage(senderID, appEnv);
    case 'help':
      return sendHelpMessage(senderID, appEnv);
    case 'button':
      return sendButton(senderID, appEnv);
    case 'list':
      return sendListTemplate(senderID, appEnv);
    case 'generic':
      return sendGenericTemplate(senderID, appEnv);
    case 'open graph':
      return sendOpenGraphTemplate(senderID, appEnv);
    case 'receipt':
      return sendReceiptTemplate(senderID, appEnv);
    case 'flight':
      return sendFlightTemplate(senderID, appEnv);
    case 'quick reply':
      return sendQuickReply(senderID, appEnv);
    case 'extension':
      return sendExtension(senderID, appEnv);
    case 'inbox':
      return showInbox(senderID, appEnv);
    case (command.match(/^create group \w+( \d+)+/) || {}).input:
      return createGroup(items[2], items.slice(3), appEnv);
    case (command.match(/^add to group \w+( \d+)+/) || {}).input:
      return messageSender.addToGroup(items[3], items.slice(4), appEnv.token);
    case (command.match(/^remove from group \w+( \d+)+/) || {}).input:
      return messageSender.removeFromGroup(items[3], items.slice(4), appEnv.token);
    default:
      return messageSender.postTextMessage(senderID, 'Did you just say ' + messageText + '? Try "help" to find the list of commands supported!', appEnv.token);
  }
}

function showInbox(senderID, appEnv) {
  return messageSender.inbox(appEnv.token).then(results => {
    var result = Promise.resolve();

    if (results.length == 0) {
      result = messageSender.postTextMessage(senderID, 'No group chats', appEnv.token);
    } else {
      results.forEach(thread => {
        result = result.then(x => {
          var text = "Thread: " + thread.id + " " + (thread.name || '') + "\n";
          thread.participants.data.forEach(participant => { text += participant.name + " (" + participant.id + ")\n" });
          return messageSender.postTextMessage(senderID, text, appEnv.token);
        });
      });
    }

    return result;
  });

}

function createGroup(threadName, recipients, appEnv) {
  const messageData = {
    message: {
      text: "New Group"
    }
  };

  return messageSender
    .postMessage(recipients, messageData, appEnv.token).then(threadData =>
      messageSender.renameThread(threadData.thread_key, threadName, appEnv.token));
}

function sendGreetingMessage(senderID, appEnv) {
  return messageSender.postTextMessage(senderID, 'Hi there! Type "help" to check out the full list of commands', appEnv.token);
}

function sendHelpMessage(senderID, appEnv) {
  return messageSender.postTextMessage(
    senderID, '`hi             Greeting from Pusheen`\n\
`help               The command you are seeing right now`\n\
`button             Send Button Template`\n\
`list               Send List Template`\n\
`generic            Send Generic Template`\n\
`open graph         Send Open Graph Template`\n\
`receipt            Send Receipt Template`\n\
`flight             Send Flight Template`\n\
`quick reply        Send Quick Reply`\n\
`extension          Send a web button with Extension SDK integrated`\n\
`inbox              Show bot inbox`\n\
`create group       Create a group with (name recipient1 recipient2..recipientN)`\n\
`add to group       Remove recipients from a group (t_xxxx recipient1 recipient2..recipientN)`\n\
`remove from group  Add recipients to a group (t_xxxx recipient1 recipient2..recipientN)`',
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
      pathname: 'api/extension',
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

function sendGenericTemplate(senderID, appEnv) {
  return messageSender.postMessage(
    senderID,
    {
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'generic',
            elements: [
              {
                title: 'Welcome to Workplace',
                image_url: 'https://petersfancybrownhats.com/company_image.png',
                subtitle: 'We\'ve got the right hat for everyone.',
                default_action: {
                  type: 'web_url',
                  url: 'https://workplace.facebook.com',
                  messenger_extensions: false,
                  webview_height_ratio: 'tall'
                },
                buttons: [
                  {
                    type: 'postback',
                    title: 'Start Chatting',
                    payload: 'DEVELOPER_DEFINED_PAYLOAD'
                  },
                  {
                    type: "web_url",
                    messenger_extensions: false,
                    url: 'https://workplace.facebook.com',
                    title: "ReallyLongNameReallyLongNameReallyLongNameReallyLongNameReallyLongNameReallyLongNameReallyLongNameReallyLongNameReallyLongNameReallyLongName.pdf",
                    webview_height_ratio: "tall"
                  }
                ]
              }
            ]
          }
        }
      }
    },
    appEnv.token
  );
}

function sendListTemplate(senderID, appEnv) {
  return messageSender.postMessage(
    senderID,
    {
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'list',
            top_element_style: 'compact',
            elements: [
              {
                title: 'Classic T-Shirt Collection',
                subtitle: 'See all our colors',
                image_url: 'https://peterssendreceiveapp.ngrok.io/img/collection.png',
                buttons: [
                  {
                    title: 'View',
                    type: 'web_url',
                    url: 'https://messenger-bot-extension.herokuapp.com/',
                    messenger_extensions: false,
                    webview_height_ratio: 'tall',
                    fallback_url: 'https://peterssendreceiveapp.ngrok.io/'
                  }
                ]
              },
              {
                title: 'Classic White T-Shirt',
                subtitle: 'See all our colors',
                default_action: {
                  type: 'web_url',
                  url: 'https://messenger-bot-extension.herokuapp.com/',
                  messenger_extensions: false,
                  webview_height_ratio: 'tall'
                }
              },
              {
                title: 'Classic Blue T-Shirt',
                image_url: 'https://peterssendreceiveapp.ngrok.io/img/blue-t-shirt.png',
                subtitle: '100% Cotton, 200% Comfortable',
                default_action: {
                  type: 'web_url',
                  url: 'https://messenger-bot-extension.herokuapp.com/',
                  messenger_extensions: false,
                  webview_height_ratio: 'tall',
                  fallback_url: 'https://peterssendreceiveapp.ngrok.io/'
                },
                buttons: [
                  {
                    title: 'Shop Now',
                    type: 'web_url',
                    url: 'https://messenger-bot-extension.herokuapp.com/',
                    messenger_extensions: false,
                    webview_height_ratio: 'tall',
                    fallback_url: 'https://peterssendreceiveapp.ngrok.io/'
                  }
                ]
              }
            ],
            buttons: [
              {
                title: 'View More',
                type: 'postback',
                payload: 'payload'
              }
            ]
          }
        }
      }
    },
    appEnv.token
  );
}

function sendOpenGraphTemplate(senderID, appEnv) {
  return messageSender.postMessage(
    senderID,
    {
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'open_graph',
            elements: [
              {
                url: 'https://open.spotify.com/track/7GhIk7Il098yCjg4BQjzvb',
                buttons: [
                  {
                    type: 'web_url',
                    url: 'https://en.wikipedia.org/wiki/Rickrolling',
                    title: 'View More'
                  }
                ]
              }
            ]
          }
        }
      }
    },
    appEnv.token
  );
}

function sendReceiptTemplate(senderID, appEnv) {
  return messageSender.postMessage(
    senderID,
    {
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'receipt',
            recipient_name: 'Stephane Crozatier',
            order_number: '12345678902',
            currency: 'USD',
            payment_method: 'Visa 2345',
            order_url: 'http://petersapparel.parseapp.com/order?order_id=123456',
            timestamp: '1428444852',
            address: {
              street_1: '1 Hacker Way',
              street_2: '',
              city: 'Menlo Park',
              postal_code: '94025',
              state: 'CA',
              country: 'US'
            },
            summary: {
              subtotal: 75,
              shipping_cost: 4.95,
              total_tax: 6.19,
              total_cost: 56.14
            },
            adjustments: [
              {
                name: 'New Customer Discount',
                amount: 20
              },
              {
                name: '$10 Off Coupon',
                amount: 10
              }
            ],
            elements: [
              {
                title: 'Classic White T-Shirt',
                subtitle: '100% Soft and Luxurious Cotton',
                quantity: 2,
                price: 50,
                currency: 'USD',
                image_url: 'http://petersapparel.parseapp.com/img/whiteshirt.png'
              },
              {
                title: 'Classic Gray T-Shirt',
                subtitle: '100% Soft and Luxurious Cotton',
                quantity: 1,
                price: 25,
                currency: 'USD',
                image_url: 'http://petersapparel.parseapp.com/img/grayshirt.png'
              }
            ]
          }
        }
      }
    },
    appEnv.token
  );
}

function sendFlightTemplate(senderID, appEnv) {
  return messageSender.postMessage(
    senderID,
    {
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'airline_boardingpass',
            intro_message: 'You are checked in.',
            locale: 'en_US',
            boarding_pass: [
              {
                passenger_name: 'SMITH/NICOLAS',
                pnr_number: 'CG4X7U',
                seat: '74J',
                logo_image_url: 'https://www.example.com/en/logo.png (http://www.example.com//en//logo.png)',
                header_image_url: 'https://www.example.com/en/fb/header.png (http://www.example.com//en//fb//header.png)',
                qr_code: 'M1SMITH/NICOLAS CG4X7U nawouehgawgnapwi3jfa0wfh',
                above_bar_code_image_url: 'https://www.example.com/en/PLAT.png (http://www.example.com//en//PLAT.png)',
                auxiliary_fields: [
                  {
                    label: 'Terminal',
                    value: 'T1'
                  },
                  {
                    label: 'Departure',
                    value: '30OCT 19:05'
                  }
                ],
                secondary_fields: [
                  {
                    label: 'Boarding',
                    value: '18:30'
                  },
                  {
                    label: 'Gate',
                    value: 'D57'
                  },
                  {
                    label: 'Seat',
                    value: '74J'
                  },
                  {
                    label: 'Sec.Nr.',
                    value: '003'
                  }
                ],
                flight_info: {
                  flight_number: 'KL0642',
                  departure_airport: {
                    airport_code: 'JFK',
                    city: 'New York',
                    terminal: 'T1',
                    gate: 'D57'
                  },
                  arrival_airport: {
                    airport_code: 'AMS',
                    city: 'Amsterdam'
                  },
                  flight_schedule: {
                    departure_time: '2016-01-02T19:05',
                    arrival_time: '2016-01-05T17:30'
                  }
                }
              }
            ]
          }
        }
      }
    },
    appEnv.token
  );
}
