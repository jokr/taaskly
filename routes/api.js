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

router.route('/webhook')
  .get((req, res, next) => {
    let params = req.query;
    if (!params['hub.mode'] || !params// ['hub.challenge'] || !params['hub.verify_token']) {
//       return res.status(400).send('Invalid verification request.');
//     }
//     if (params['hub.verify_token'] !== process.env.VERIFY_TOKEN) {
//       return res.status(400).send('Invalid verify token.');
//     }
    return res.send(params['hub.challenge']);
  })
  .post((req, res, next) => {
    res.status(200).send("OK");
  });

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
    db.models.callback
      .create({ headers: req.headers, body: req.body })
      .then()
      .catch(error => logger.warn(error));

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

    const regexMatch = change.link.match(/^https:\/\/pusheen-suite\.herokuapp\.com\/document\/([0-9]+)/);
    if (regexMatch === null || regexMatch.length !== 2) {
      return res.status(400).send('Unknown document link');
    }

    Promise.all([
        db.models.document.findById(parseInt(regexMatch[1])),
        db.models.community.findById(parseInt(change.community.id)),
        db.models.user.findOne({where: {workplaceID: change.user.id}}),
      ])
      .then(results => {
        const doc = results[0];
        if (doc === null) {
          return res.status(404).send('No document with this id exists.');
        }
        const community = results[1];
        if (community === null) {
          return res.status(400).send('Unknown community.');
        }
        const user = results[2];
        if (doc.privacy !== 'public' && doc.ownerId !== user.id) {
          return res
            .status(200)
            .json({
              data: [],
              linked_user: user !== null,
            });
        }
        return res
          .status(200)
          .json({
            data: [{
              link: change.link,
              title: doc.name,
              privacy: doc.privacy === 'public' ? 'organization' : 'accessible',
              type: 'document',
            }],
            linked_user: user !== null,
          });
      })
      .catch(next);
  });

router.use('*', (req, res, next) => res.status(404).send());
router.use(errorHandler);

module.exports = router;
