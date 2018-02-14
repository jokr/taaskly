'use strict';

const bodyParser = require('body-parser');
const crypto = require('crypto');
const express = require('express');
const logger = require('heroku-logger');

const db = require('../db');
const messages = require('../messages');

const router = express.Router();

const validate = process.env.NODE_ENV === 'true';

class BadRequest extends Error {
  constructor(message) {
    super();
    this.name = "BadRequest";
    this.message = (message || "");
    Error.captureStackTrace(this);
  }
}

function errorHandler(err, req, res, next) {
  logger.error(err);

  if (err instanceof BadRequest) {
    res.status(400).json({message: err.message, details: err.stack});
  } else {
    res.status(500).json({message: err.message, details: err.stack});
  }
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

function processChallenge(req, res, next) {
  let params = req.query;
  if (!params['hub.mode'] || !params['hub.challenge'] || !params['hub.verify_token']) {
    throw new BadRequest('Invalid verification request.');
  }
  if (params['hub.verify_token'] !== process.env.VERIFY_TOKEN) {
    throw new BadRequest('Invalid verify token.');
  }
  return res.status(200).send(params['hub.challenge']);
}

function logAndValidateCallback(req, res, next) {
  db.models.callback
    .create({ path: req.originalUrl, headers: req.headers, body: req.body })
    .then()
    .catch(error => logger.warn(error));
  if (validate && !req.xhub) {
    logger.warn('missing x-hub-signature');
    throw new BadRequest('Invalid x-hub-signature.');
  }
  next();
}

router.use(bodyParser.json({ verify: xhub }));

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

router.route('/message_callback')
  .get(processChallenge)
  .post(
    logAndValidateCallback,
    (req, res, next) => {
      // TODO should handle batching of entries
      const messaging = readMessaging(req.body);

      console.log(messaging);

      if (messaging.message) {
        // t_xxxxx for threads
        const target = messaging.thread ? messaging.thread.id : messaging.sender.id;
        messages.postMessage(target, "Hey");
      }

      return res.status(200).send("OK");
    });

function readChange(body) {
    if (body.entry.length !== 1) {
      logger.warn(`expected exactly one entry, got ${body.entry.length}`);
      throw new BadRequest('Malformatted request.');
    }
    if (body.entry[0].changes.length !== 1) {
      logger.warn(`expected exactly one change, got ${body.entry.changes.length}`);
      throw new BadRequest('Malformatted request.');
    }
    return body.entry[0].changes[0].value;
}

router.route('/unfurl_callback')
  .get(processChallenge)
  .post(
    logAndValidateCallback,
    (req, res, next) => {
      if (req.body.object !== 'link') {
        logger.warn('Received invalid link webhook', req.body);
        throw new BadRequest('Invalid topic.');
      }

      const change = readChange(req.body);

      const regexMatch = change.link.match(/^https:\/\/pusheen-suite\.herokuapp\.com\/document\/([0-9]+)/);
      if (regexMatch === null || regexMatch.length !== 2) {
        throw new BadRequest('Unknown document link');
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
          const data = {
            link: change.link,
            title: doc.name,
            description: doc.content.toString().substring(0, 200),
            privacy: doc.privacy === 'public' ? 'organization' : 'accessible',
            type: 'doc',
          };
          if (doc.icon) {
            data.icon = process.env.BASE_URL + doc.icon;
          }
          return res
            .status(200)
            .json({
              data: [data],
              linked_user: user !== null,
            });
        })
        .catch(next);
    });

router.use('*', (req, res, next) => res.status(404).send());
router.use(errorHandler);

module.exports = router;
