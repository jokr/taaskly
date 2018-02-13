'use strict';

const base64url = require('base64url');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const express = require('express');
const logger = require('heroku-logger');
const passport = require('passport');

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
      const referrer = req.session.loginReferrer || '/documents';
      delete req.session.loginReferrer;
      return res.redirect(referrer);
    },
  );

router.route('/register')
  .get((req, res, next) => res.render('register'))
  .post((req, res, next) => {
    const hash = bcrypt.hash(req.body.password, parseInt(process.env.SALT_ROUNDS))
      .then(hash => db.models.user.create({username: req.body.username, passwordHash: hash}))
      .then(user => {
        req.login(user, err => {
          if (err) {
            logger.warn(err);
            return next(err);
          }
          return res.redirect('/users');
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
    graph('oauth/access_token')
      .qs({
        client_id: process.env.APP_ID,
        client_secret: process.env.APP_SECRET,
        redirect_uri: process.env.APP_REDIRECT,
        code: req.query.code,
      })
      .send()
      .then(tokenResponse => graph('community')
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
      )
      .then(commmunity => res.redirect('/admin/communities'))
      .catch(next);
  });

router.route('/link_account')
  .post((req, res, next) => {
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
    Promise.all([
      db.models.community.findById(decodedPayload.community_id),
      db.models.user.findOne({where: {workplaceID: decodedPayload.user_id}}),
    ]).then(results => {
      const [community, user] = results;
      if (!community) {
        return res
          .status(400)
          .render(
            'error',
            {message: `No community with id ${decodedPayload.community_id} found`},
          );
      }
      if (user && user.id !== req.user.id) {
        return res
          .status(400)
          .render(
            'error',
            {message: `This user is already linked to somebody else.`},
          );
      }
      if (req.user) {
        return req.user
          .set('workplaceID', decodedPayload.user_id)
          .save()
          .then(user => res.render('linkSuccess'));
      }
    })
    .catch(next);
  });

module.exports = router;
