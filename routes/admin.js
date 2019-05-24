'use strict';

const crypto = require('crypto');
const express = require('express');
const logger = require('heroku-logger');

const db = require('../db');
const graph = require('../graph');

const router = express.Router();

router.use((req, res, next) => {
  res.locals.navigation = [
    {name: 'Users', path: '/admin/users'},
    {name: 'Communities', path: '/admin/communities'},
    {name: 'Installs', path: '/admin/installs'},
    {name: 'Callbacks', path: '/callbacks'},
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
  .post((req, res, next) =>
    Promise.all([
      webhookSubscribe('link', ['preview', 'collection']),
      webhookSubscribe('page', ['mention']),
    ])
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
        }].concat(communities);
      }
      return communities;
    })
    .then(communities => Promise.all(
      communities.map(community =>
        graph('community')
          .qs({fields: 'id,install'})
          .token(community.accessToken)
          .send()
          .then(response => {
            community.permissions = response.install.permissions;
            community.installType = response.install.install_type;
            return community;
          }),
    )))
    .then(communities => {
      const state = crypto.randomBytes(12).toString('hex');
      res.render('communities', {communities, state});
    })
    .catch(next),
  );

router.route('/installs')
  .get((req, res, next) => db.models.page
    .findAll({order: [['id', 'ASC']]})
    .then(pages => Promise.all(
      pages.map(page =>
        graph('community')
          .qs({fields: 'id,install'})
          .token(page.accessToken)
          .send()
          .then(response => {
            page.permissions = response.install.permissions;
            page.installType = response.install.install_type;
            return page;
          }),
    )))
    .then(pages => {
      const state = crypto.randomBytes(12).toString('hex');
      res.render('installs', {pages, state});
    })
    .catch(next),
  );

router.route('/users')
  .get((req, res, next) => db.models.user
    .findAll({order: [['createdAt', 'DESC']], include: [{ model: db.models.community, as: 'community' }]})
    .then(users => res.render('users', {users})),
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

function webhookSubscribe(topic, fields) {
  return graph('app/subscriptions')
    .post()
    .appSecret()
    .qs({
      object: topic,
      callback_url: `https://www.taaskly.com/api/${topic}/callback`,
      verify_token: process.env.VERIFY_TOKEN,
      fields: fields,
    })
    .send()
}

module.exports = router;
