'use strict';

const crypto = require('crypto');
const express = require('express');
const logger = require('heroku-logger');
const {URL, URLSearchParams} = require('url');

const db = require('../db');
const graph = require('../graph');

const router = express.Router();

router.use((req, res, next) => {
  res.locals.navigation = [
    {name: 'Users', path: '/admin/users'},
    {name: 'Installs', path: '/admin/installs'},
    {name: 'Callbacks', path: '/callbacks'},
    {name: 'Install', path: '/admin/install'},
    {name: 'Login', path: '/admin/login'},
    {name: 'Subscriptions', path: '/admin/subscriptions'},
  ];
  next();
});

router.route('/')
  .get((req, res, next) => res.redirect('/admin/subscriptions'))

router.route('/subscriptions')
  .get((req, res, next) => graph('app/subscriptions')
    .appSecret()
    .send()
    .then(subscriptions => res.render('subscriptions', {subscriptions: subscriptions.data}))
    .catch(next)
  );

router.route('/install')
  .get((req, res, next) => {
    res.render('adminInstall', {
      appID: process.env.APP_ID,
      graphVersion: process.env.GRAPH_VERSION || 'v3.2',
      redirectURI: process.env.APP_USER_REDIRECT,
    });
  });

router.route('/subscribe')
  .post((req, res, next) => {
      const {topic, field} = req.body;
      let request = null;
      if (topic && field) {
        request = webhookSubscribe(topic, [field]);
      } else {
        request = Promise.all([
          webhookSubscribe('link', ['preview', 'collection']),
          webhookSubscribe('page', ['mention']),
        ]);
      }
      return request
        .then(() => res.redirect('/admin'))
        .catch(next);
    },
  );

router.route('/installs')
  .get((req, res, next) => db.models.install
    .findAll({include: [{model: db.models.community, as: 'community'}]})
    .then(installs => {
      if (process.env.APP_ID && process.env.ACCESS_TOKEN) {
        return [{
          id: process.env.APP_ID,
          name: 'Custom Integration',
          accessToken: process.env.ACCESS_TOKEN,
        }].concat(installs);
      }
      return installs;
    })
    .then(installs => Promise.all(
      installs.map(install =>
        graph('community')
          .qs({fields: 'id,install'})
          .token(install.accessToken)
          .send()
          .then(response => {
            install.permissions = response.install.permissions;
            install.installType = response.install.install_type;
            return install;
          }),
    )))
    .then(installs => {
      const state = crypto.randomBytes(12).toString('hex');
      const installUrl = new URL('https://work.workplace.com//dialog/work/app_install/');
      const params = new URLSearchParams({
        "app_id": process.env.APP_ID,
        "state": state,
        "redirect_uri": process.env.APP_REDIRECT,
        "permissions": ['message'],
      });
      installUrl.search = params;
      res.render('installs', {installs, installUrl: installUrl.toString()});
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
      callback_url: process.env.BASE_URL+`api/${topic}/callback`,
      verify_token: process.env.VERIFY_TOKEN,
      fields: fields,
    })
    .send()
}

module.exports = router;
