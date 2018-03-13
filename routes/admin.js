'use strict';

const express = require('express');
const logger = require('heroku-logger');

const db = require('../db');
const graph = require('../graph');

const router = express.Router();

router.use((req, res, next) => {
  res.locals.navigation = [
    {name: 'Users', path: '/admin/users'},
    {name: 'Communities', path: '/admin/communities'},
    {name: 'Callbacks', path: '/admin/callbacks'},
  ];
  next();
});

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
    .then(communities => {
      if (process.env.APP_ID && process.env.ACCESS_TOKEN) {
        return [{
          id: process.env.APP_ID,
          name: 'Custom Integration',
          accessToken: process.env.ACCESS_TOKEN,
          installType: 'Custom Integration'
        }].concat(communities);
      }
      return communities;
    })
    .then(communities => Promise.all(
      communities.map(
        community =>
        graph('me/messenger_profile?fields=whitelisted_domains,home_url')
          .token(community.accessToken)
          .send()
          .then(result => {
            community['config'] = result.data[0] || '';
            return community;
          })
          .catch(() => {
            return community;
          })
        )
      )
    )
    .then(communities => res.render('communities', {communities}))
    .catch(next),
  );

router.route('/community/config')
  .post((req, res, next) => db.models.community
    .findOne({where: {id: req.body.app_id}})
    .then(community => {
      if (community) {
        return community.accessToken;
      }
      if (process.env.APP_ID === req.body.app_id) {
        return process.env.ACCESS_TOKEN;
      }
      throw new BadRequest('Unknown app id.');
    })
    .then(accessToken => {
      const graphRequest = graph('me/messenger_profile')
        .token(accessToken);
      if (req.body.config) {
        return graphRequest.body(JSON.parse(req.body.config)).post().send();
      } else {
        return graphRequest.body({
          fields: [
            'whitelisted_domains',
            'home_url'
          ]
        }).delete().send();
      }
    })
    .then(() => res.redirect('/admin/communities'))
    .catch(next),
  );

router.route('/users')
  .get((req, res, next) => db.models.user
    .findAll({order: [['createdAt', 'DESC']]})
    .then(users => res.render('users', {users})),
  );

router.route('/callbacks')
  .get((req, res, next) => db.models.callback
    .findAll({order: [['createdAt', 'DESC']]})
    .then(callbacks => res.render('callbacks', {callbacks}))
    .catch(next),
  );

router.route('/delete_callbacks')
  .post((req, res, next) => db.models.callback
    .destroy({truncate: true})
    .then(() => res.redirect('/admin/callbacks')),
  );

router.route('/user/:id/unlink')
  .post((req, res, next) => db.models.user
    .findById(req.params.id)
    .then(user => user.set('workplaceID', null).save())
    .then(() => res.redirect('/admin/users'))
    .catch(next),
  );

router.route('/user/:id/delete')
  .post((req, res, next) => db.models.user
    .destroy({ where: {id: req.params.id}})
    .then(() => res.redirect('/admin/users'))
    .catch(next),
  );

module.exports = router;
