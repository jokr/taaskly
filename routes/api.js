'use strict';

const bodyParser = require('body-parser');
const crypto = require('crypto');
const express = require('express');
const logger = require('heroku-logger');

const db = require('../db');

const router = express.Router();

function errorHandler(err, req, res, next) {
  logger.error(err);
  res.status(500).json({message: err.message, details: err.stack});
}

function xhub(req, res, buf, encoding) {
  const shaSignature = req.get('x-hub-signature');
  if (!shaSignature) {
    req.xhub = false;
    return;
  }

  const bodySignature = crypto.createHmac('sha1', process.env.APP_SECRET)
    .update(buf, encoding)
    .digest('hex');
  if ('sha1=' + bodySignature !== shaSignature) {
    logger.warn('mismatch xhub', {expected: shaSignature, actual: bodySignature});
    req.xhub = false;
    return;
  }
  req.xhub = true;
}

router.use(bodyParser.json({ verify: xhub }));

router.route('/unfurl_callback')
  .get((req, res, next) => {
    let params = req.query;
    if (!params['hub.mode'] || !params['hub.challenge'] || !params['hub.verify_token']) {
      return res.status(400).send('Invalid verification request.');
    }
    if (params['hub.verify_token'] !== process.env.VERIFY_TOKEN) {
      return res.status(400).send('Invalid verify token.');
    }
    return res.send(params['hub.challenge']);
  })
  .post((req, res, next) => {
    db.models.callback.create({ headers: req.headers, body: req.body }).then();

    if (!req.xhub) {
      logger.warn('missing x-hub-signature');
      return res.status(400).send('Invalid x-hub-signature.');
    }
    if (req.body.object !== 'link') {
      logger.warn('Received invalid link webhook', req.body);
      return res.status(400).send('Invalid topic.');
    }

    if (req.body.entry.length !== 1) {
      logger.warn(`expected exactly one entry, got ${req.body.entry.length}`);
      return res.status(400).send('Malformatted request.');
    }

    if (req.body.entry[0].changes.length !== 1) {
      logger.warn(`expected exactly one change, got ${entry.changes.length}`);
      return res.status(400).send('Malformatted request.');
    }
    const change = req.body.entry[0].changes[0].value;

    return res
      .status(200)
      .json({
        data : [],
        linked_user: false,
      });
  });

router.use('*', (req, res, next) => res.status(404).send());
router.use(errorHandler);

module.exports = router;
