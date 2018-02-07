'use strict';

const express = require('express');
const logger = require('heroku-logger');

const db = require('../db');
const graph = require('../graph');

const router = express.Router();

router.route('/')
  .get((req, res, next) => graph('app/subscriptions')
    .appSecret()
    .send()
    .then(subscriptions => res.render('admin', {subscriptions: subscriptions.data}))
    .catch(next),
  );

router.route('/subscribe')
  .post((req, res, next) => graph('app/subscriptions')
    .post()
    .appSecret()
    .qs({
      object: 'link',
      callback_url: process.env.WEBHOOK_CALLBACK,
      verify_token: process.env.VERIFY_TOKEN,
      fields: ['preview'],
    })
    .send()
    .then(() => res.redirect('/admin'))
    .catch(next),
  );

router.route('/communities')
  .get((req, res, next) => db.models.community
    .findAll({order: [['name', 'ASC']]})
    .then(communities => res.render('communities', {communities}))
    .catch(next),
  );

module.exports = router;
