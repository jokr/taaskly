'use strict';

const base64url = require('base64url');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const express = require('express');
const logger = require('heroku-logger');

const db = require('../../db');
const BadRequest = require('./BadRequest');

const router = express.Router();

const validate = process.env.VALIDATE_XHUB !== 'false';

function errorHandler(err, req, res, next) {
  logger.error(err);

  if (res.headersSent) {
    return;
  }

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
  if (!req.xhub) {
    logger.warn('missing x-hub-signature');
    if (validate) {
      throw new BadRequest('Invalid x-hub-signature.');
    }
  }
  next();
}

router.use(bodyParser.json({ verify: xhub }));

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

router.get('*', (req, res, next) => {
  let params = req.query;
  if (!params['hub.mode'] && !params['hub.challenge'] && !params['hub.verify_token']) {
    next();
  }
  // console.log(params['hub.verify_token']);
  // if (params['hub.verify_token'] !== process.env.VERIFY_TOKEN) {
  //   throw new BadRequest('Invalid verify token.');
  // }
  return res.status(200).send(params['hub.challenge']);
});
router.post('*', logAndValidateCallback);
router.use('/link', require('./link'));
router.use('/page', require('./page'));
router.use('*', (req, res, next) => res.status(404).send());
router.use(errorHandler);

module.exports = router;
