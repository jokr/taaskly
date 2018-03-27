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
      const data = req.body;
      data.entry.forEach(function(singleEntry) {
        singleEntry.messaging.forEach(function(messagingEvent) {
          message_handler.handleSingleMessageEvent(req, messagingEvent);
        });
      });

      return res.status(200).send("OK");
    });

module.exports = router;