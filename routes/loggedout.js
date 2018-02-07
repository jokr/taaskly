'use strict';

const bcrypt = require('bcrypt');
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
  .post(passport.authenticate('local', { failureRedirect: '/login', successRedirect: '/users'}));

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

module.exports = router;
