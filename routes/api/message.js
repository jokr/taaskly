'use strict';

const express = require('express');

const BadRequest = require('./BadRequest');
const message_handler = require('../../message_handler');
const messages = require('../../messages');

const router = express.Router();

function readMessaging(body) {
  if (body.entry.length !== 1) {
    logger.warn(`expected exactly one entry, got ${body.entry.length}`);
    throw new BadRequest('Malformatted request.');
  }
  if (body.entry[0].messaging.length !== 1) {
    logger.warn(`expected exactly one change, got ${body.entry.messaging.length}`);
    throw new BadRequest('Malformatted request.');
  }

  return body.entry[0].messaging[0];
}

router.route('/callback')
  .post(
    (req, res, next) => {
      console.log('----- req ------');
      console.log(JSON.stringify(req.headers));
      console.log(JSON.stringify(req.body));
      console.log('----- req ------');
      const data = req.body;
      if (data.entry) {
        data.entry.forEach(function(singleEntry) {
          if (singleEntry.messaging) {
            singleEntry.messaging.forEach(function(messagingEvent) {
              message_handler.handleSingleMessageEvent(req, messagingEvent);
            });
          }
        });
      }

      return res.status(200).send("OK");
    });

module.exports = router;
