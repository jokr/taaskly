'use strict';

const express = require('express');
const logger = require('heroku-logger');

const router = express.Router();

function errorHandler(err, req, res, next) {
  logger.error(err);
  res.status(500).json({message: err.message, details: err.stack});
}

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
  });

router.use('*', (req, res, next) => res.status(404).send());
router.use(errorHandler);

module.exports = router;
