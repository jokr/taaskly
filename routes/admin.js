'use strict';

const crypto = require('crypto');
const express = require('express');
const logger = require('heroku-logger');
const {URL, URLSearchParams} = require('url');
const randomName = require('node-random-name');

const db = require('../db');
const graph = require('../graph');

const router = express.Router();

router.use((req, res, next) => {
  res.locals.navigation = [
    {name: 'Users', path: '/admin/users'},
    {name: 'Installs', path: '/admin/installs'},
    {name: 'Callbacks', path: '/callbacks'},
    {name: 'Login', path: '/admin/login'},
    {name: 'Subscriptions', path: '/admin/subscriptions'},
    {name: 'Chat', path: '/admin/chat'},
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
          })
          .catch(() => install),
    )))
    .then(installs => {
      const state = crypto.randomBytes(12).toString('hex');
      const installUrl = 'https://work.workplace.com/dialog/work/app_install/';
      const installParams = {
        app_id: process.env.APP_ID,
        state: state,
        redirect_uri: process.env.APP_REDIRECT,
      };
      const permissions = process.env.PERMISSIONS
        .split(',')
        .sort();
      res.render('installs', {installs, installUrl, installParams, permissions});
    })
    .catch(next),
  );

router.route('/install/:id/delete')
  .post((req, res, next) => db.models.install
    .destroy({where: {pageId: req.params.id}})
    .then(() => res.redirect('/admin/installs'))
    .catch(next)
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

router.route('/chat/')
  .get((req, res, next) => db.models.install
    .findAll()
    .then(installs => {
      const ref = Math.random().toString(36).slice(4);
      for (const install of installs) {
        const deeplink = new URL(`https://w.m.me/${install.pageId}`);
        install.prettylink = deeplink.toString();
        const params = new URLSearchParams({
          "ref": ref,
        });
        deeplink.search = params;
        install.deeplink = deeplink.toString();
      }
      res.render('chat', {installs, ref: ref});
    })
    .catch(next)
  );

router.route('/chat/:id/get_started')
  .post((req, res, next) => {
    db.models.install
      .findOne({where: {pageId: req.params.id}})
      .then(install =>
        graph('me/messenger_profile')
          .post()
          .body({get_started: { payload: `get_started_payload_${req.params.id}`}})
          .token(install.accessToken)
          .send()
      )
      .then(() => res.redirect('/admin/chat'))
      .catch(next);
  });

router.route('/idp/:id/users')
  .get((req, res, next) => {
    db.models.install
      .findOne({where: {pageId: req.params.id}})
      .then(install =>
        graph('community/organization_members')
          .token(install.accessToken)
          .qs({ fields: 'id,name,email', limit: 5000 })
          .send()
      )
      .then(response => res.render('idp/users', {users: response.data}))
      .catch(next)
  })
  .post((req, res, next) => {
    db.models.install
      .findOne({where: {pageId: req.params.id}})
      .then(install => {
        const count = parseInt(req.body.count);
        const requests = Array(count).fill(count).map(() => {
          const name = randomName();
          const email = name.replace(/ /g, '').toLowerCase() + '_' + crypto.randomBytes(10).toString('hex') + '@taaskly.com';
          return graph('community/accounts')
            .post()
            .token(install.accessToken)
            .body({name, email})
            .send()
            .catch(err => {
              logger.error(err);
            });
        });
        return Promise.all(requests);
      })
      .then(response => {
        res.redirect(`/admin/idp/${req.params.id}/users`);
      })
      .catch(next)
  });

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
