'use strict';

const base64url = require('base64url');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const express = require('express');
const logger = require('heroku-logger');
const passport = require('passport');
const Op = require('sequelize').Op;

const db = require('../db');
const graph = require('../graph');

const router = express.Router();

router.route('/')
  .get((req, res, next) => res.render('home'));

router.route('/login')
  .get((req, res, next) => res.render('login'))
  .post(
    passport.authenticate('local', { failureRedirect: '/login' }),
    (req, res, next) => {
      if (req.session.signedRequest) {
        return res.redirect('/link_account_confirm');
      }
      const referrer = req.session.loginReferrer || '/documents';
      delete req.session.loginReferrer;
      return res.redirect(referrer);
    },
  );

router.route('/register')
  .get((req, res, next) => res.render('register'))
  .post((req, res, next) => {
    const hash = bcrypt.hash(req.body.password, 10)
      .then(hash => db.models.user.create({username: req.body.username, passwordHash: hash}))
      .then(user => {
        req.login(user, err => {
          if (err) {
            logger.warn(err);
            return next(err);
          }
          return res.redirect('/documents');
        });
      })
      .catch(err => {
        logger.warn(err);
        return next(err);
      });
  });

router.route('/community_install')
  .get((req, res, next) => {
    if (!req.query.code) {
      return res
        .status(400)
        .render('error', {message: 'No code received.'});
    }

    // console.log('---------- INSTALL -----------');
    // console.log(req.query.code);
    // console.log('---------- INSTALL -----------');
    graph('oauth/access_token')
      .qs({
        client_id: process.env.APP_ID,
        client_secret: process.env.APP_SECRET,
        redirect_uri: process.env.APP_REDIRECT,
        code: req.query.code,
      })
      .send()
      .then(tokenResponse => {
        console.log(tokenResponse);
        return graph('community')
        .token(tokenResponse.access_token)
        .qs({ fields: 'name' })
        .send()
        .then(communityResponse => db.models.community
          .findById(communityResponse.id)
          .then(community => {
            if (community) {
              return community.update({accessToken: tokenResponse.access_token});
            } else {
              return db.models.community.create({
                id: communityResponse.id,
                name: communityResponse.name,
                accessToken: tokenResponse.access_token,
              });
            }
          })
        )
      })
      .then(community => {
        const redirect = req.query.redirect_uri;
        const state = req.query.state;
        res.render('installSuccess', {community, state, redirect});
      })
      .catch(next);
  });

router.route('/link_account')
  .post((req, res, next) => {
    if (!req.body.signed_request) {
      return res
        .status(400)
        .render('error', {message: `No signed request sent.`});
    }
    if (!req.query.redirect_uri) {
      return res
        .status(400)
        .render('error', {message: `No redirect uri parameter sent.`});
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
    decodedPayload.redirect = req.query.redirect_uri;
    req.session.signedRequest = decodedPayload;
    if (!req.user) {
      return res.redirect('/login');
    }
    return res.redirect('/link_account_confirm');
  });

router.route('/delete_callbacks')
  .post((req, res, next) => db.models.callback
    .destroy({truncate: true})
    .then(() => res.redirect('/callbacks')),
  );

router.route('/callbacks')
  .get((req, res, next) => db.models.callback
    .findAll({
      where: filterCallbacks(req),
      order: [['createdAt', 'DESC']]
    })
    .then(callbacks => res.render('callbacks', {callbacks}))
    .catch(next),
  );

function filterCallbacks(req) {
  const filter = req.query.topic;
  switch (filter) {
    case 'page':
    case 'group':
    case 'link':
      return {
        path: {
          [Op.like]: '%' + filter + '%'
        }
      };
    default:
      return {};
  }
}

module.exports = router;
