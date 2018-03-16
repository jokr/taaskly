'use strict';

const base64url = require('base64url');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const express = require('express');
const logger = require('heroku-logger');
const Op = require('sequelize').Op;

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

router.route('/extension')
  .get((req, res, next) => res.render('extension'));

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

      const regexMatch = change.link.match(/\/(document|task)\/([0-9]+)/);
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
                .findById(id, {where: {
                  [Op.or]: {
                    privacy: 'public',
                    ownerId: user ? user.id : null,
                  },
                }})
                .then(doc => {
                  if (doc === null) {
                    return {data: [], user};
                  }
                  return {
                    data: {
                      link: change.link,
                      title: doc.name,
                      description: doc.content.toString().substring(0, 200),
                      privacy: doc.privacy === 'public' ? 'organization' : 'accessible',
                      icon: `${process.env.BASE_URL}taaskly-icon.png`,
                      type: 'doc',
                    },
                    user,
                  };
                });
              break;
            case 'task':
              return db.models.task
                .findById(id, {include: [{ model: db.models.user, as: 'owner' }]})
                .then(task => {
                  if (task === null) {
                    throw new BadRequest('No task with this id exists.');
                  }
                  const additionalData = [];
                  if (task.owner.workplaceID) {
                    additionalData.push(
                      {
                        title: 'Owner',
                        format: 'user',
                        value: task.owner.workplaceID,
                      },
                    );
                  } else {
                    additionalData.push(
                      {
                        title: 'Owner',
                        format: 'text',
                        value: task.owner.username,
                      },
                    );
                  }

                  additionalData.push(
                    {
                      title: 'Created',
                      format: 'datetime',
                      value: task.createdAt,
                    },
                  );

                  if (task.priority !== null) {
                    additionalData.push(
                      {
                        title: 'Priority',
                        format: 'text',
                        value: task.priority,
                      },
                    );
                  }
                  const data = {
                    link: change.link,
                    title: task.title,
                    privacy: 'organization',
                    type: 'task',
                    additional_data: additionalData,
                    icon: `${process.env.BASE_URL}taaskly-icon.png`,
                  };
                  return {data, user};
                });
              break;
            default:
              throw new BadRequest('Invalid url.');
          }
        })
        .then(response => {
          res
            .status(200)
            .json({data: [response.data], linked_user: response.user !== null});
        })
        .catch(next);
    });

router.route('/community_uninstall')
  .post((req, res, next) => {
    db.models.callback
      .create({ path: req.originalUrl, headers: req.headers, body: req.body })
      .then()
      .catch(error => logger.warn(error));

    if (!req.body.signed_request) {
      return res
        .status(400)
        .render('error', {message: `No signed request sent.`});
    }
    const parts = req.body.signed_request.split('.');
    if (parts.length !== 2) {
      return res
        .status(400)
        .render('error', {message: `Signed request is malformatted: ${req.body.signed_request}`});
    }
    const [signature, payload] = parts.map(value => base64url.decode(value));
    const expectedSignature = crypto.createHmac('sha256', process.env.APP_SECRET)
      .update(parts[1])
      .digest('hex');
    if (expectedSignature !== signature) {
      return res
        .status(400)
        .render(
          'error',
          {message: `Signed request does not match. Expected ${expectedSignature} but got ${signature}.`},
        );
    }
    const decodedPayload = JSON.parse(payload);
    db.models.community
      .destroy({ where: {id: decodedPayload.community_id}})
      .then(() => res.status(200).send())
      .catch(next);
  });

router.use('*', (req, res, next) => res.status(404).send());
router.use(errorHandler);

module.exports = router;
