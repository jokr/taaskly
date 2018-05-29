'use strict';

const express = require('express');
const Op = require('sequelize').Op;
const logger = require('heroku-logger');

const BadRequest = require('./BadRequest');
const db = require('../../db');

const router = express.Router();

router.route('/callback')
  .post((req, res, next) => {
    if (req.body.object !== 'page') {
      logger.warn('Received invalid page webhook', req.body);
      throw new BadRequest('Invalid topic.');
    }

    const mentions = req.body.entry
      .map(entry => entry.changes)
      .reduce((acc, val) => acc.concat(val), [])
      .filter(change => change.field === 'mention')
      .map(change => change.value)
      .filter(value => value.verb === 'add');
    res.status(200).send();
  });

module.exports = router;
