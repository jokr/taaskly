'use strict';

const bodyParser = require('body-parser');
const crypto = require('crypto');
const express = require('express');
const logger = require('heroku-logger');

const db = require('../db');
const messages = require('../messages');
const message_handler = require('../message_handler');

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
      const data = req.body;
      data.entry.forEach(function(singleEntry) {
        singleEntry.messaging.forEach(function(messagingEvent) {
          message_handler.handleSingleMessageEvent(req, messagingEvent);
        });
      });

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

      const regexMatch = change.link
        .match(/^https:\/\/pusheen-suite\.herokuapp\.com\/(document|task)\/([0-9]+)/);
      if (regexMatch === null || regexMatch.length !== 3) {
        throw new BadRequest('Unknown document link');
      }

      db.models.community.findById(parseInt(change.community.id))
        .then(community => {
          if (community === null) {
            throw new BadRequest('Unknown community.');
          }
          return db.models.user.findOne({where: {workplaceID: change.user.id}});
        })
        .then(user => {
          const id = parseInt(regexMatch[2]);
          switch (regexMatch[1]) {
            case 'document':
              return db.models.document
                .findById(id)
                .then(doc => {
                  if (doc === null) {
                    throw new BadRequest('No document with this id exists.');
                  }
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
                    download_url: process.env.BASE_URL + 'pdf-sample.pdf',
                    type: 'doc',
                  };
                  if (doc.icon) {
                    data.icon = process.env.BASE_URL + doc.icon;
                  }
                  return {data, user};
                });
              break;
            case 'task':
              return db.models.task
                .findById(id)
                .then(task => {
                  if (task === null) {
                    throw new BadRequest('No task with this id exists.');
                  }
                  const data = {
                    link: change.link,
                    title: task.title,
                    privacy: 'organization',
                    type: 'task',
                  };
                  return {data, user};
                });
              break;
            default:
              throw new BadRequest('Invalid url.');
          }
        })
        .then(response => {
          res.status(200).json({data: [response.data], linked_user: response.data !== null});
        })
        .catch(next);
    });

router.use('*', (req, res, next) => res.status(404).send());
router.use(errorHandler);

module.exports = router;
