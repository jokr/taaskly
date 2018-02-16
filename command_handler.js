'use strict';

const messageSender = require('./messages');

const COMMAND_HANDLER_LIST = [];

class CommandHandler {
  constructor(command, description, handleCallback) {
    this.command = command;
    this.description = description;
    this.handleCallback = handleCallback;
  }

  handleCommand(senderID, token, command) {
    return this.handleCallback(senderID, token, command);
  }

  canHandleCommand(command) {
    return this.command === command;
  }
}

function registerHandler(command, description, handleCallback) {
  COMMAND_HANDLER_LIST.push(new CommandHandler(command, description, handleCallback));
}

function init() {
  registerHandler('hi', 'Greeting from Pusheen', function(senderID, token) {
    return messageSender.postTextMessage(senderID, 'Hi there! Type "help" to check out the full list of commands', token);
  });
  registerHandler('help', 'The command you are seeing right now', function(senderID, token) {
    const handlerList = COMMAND_HANDLER_LIST;
    let helpMessage = '';
    const commandMaxLength = Math.max(...(handlerList.map(handler => handler.command.length)));

    handlerList.forEach(handler => {
      helpMessage += ('`' + handler.command.padEnd(commandMaxLength + 4) + handler.description + '`\n');
    });

    return messageSender.postTextMessage(senderID, helpMessage, token);
  });
  registerHandler('button', 'Send Button Template', sendButtonMessage);
  registerHandler('quick reply', 'Send Quick Reply', sendQuickReplyMessage);
  registerHandler('extension', 'Send a web button with Extension SDK integrated', sendExtension);
}

function sendButtonMessage(senderID, token) {
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
  return messageSender.postMessage(senderID, messageData, token);
}

function sendQuickReplyMessage(senderID, token) {
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
  return messageSender.postMessage(senderID, messageData, token);
}

function sendExtension(senderID, token) {
  var messageData = {
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "Web page with Extension SDK enabled",
          buttons:[{
            type: "web_url",
            messenger_extensions: true,
            url: "https://scott-pusheen.herokuapp.com/extension?appID=" + process.env.APP_ID,
            title: "This is a title",
            webview_height_ratio: "tall"
          }]
        }
      }
    }
  };
  return messageSender.postMessage(senderID, messageData, token);
}

init();

exports.handleCommand = function(senderID, command, token) {
  const handler = COMMAND_HANDLER_LIST.find(handler => {
    return handler.canHandleCommand(command);
  });
  if (handler) {
    return handler.handleCommand(senderID, token, command);
  }
  return null;
};
