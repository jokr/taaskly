'use strict';

const bcrypt = require('bcrypt');
const express = require('express');
const logger = require('heroku-logger');
const passport = require('passport');

const db = require('./db');

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

router.use((req, res, next) => {
  if (req.user) {
    next();
  } else {
    res.redirect('/login');
  }
});

router.route('/logout')
  .get((req, res, next) => {
    req.logout();
    res.redirect('/');
  });

router.route('/users')
  .get((req, res, next) => db.models.user
    .findAll({order: [['createdAt', 'DESC']]})
    .then(users => res.render('users', {users})),
  );

router.route('/documents')
  .get((req, res, next) => db.models.document
    .findAll({order: [['updatedAt', 'DESC']]})
    .then(documents => res.render('documents', {documents}))
    .catch(next),
  );

router.route('/document/create')
  .get((req, res, next) => res.render('createDocument'))
  .post((req, res, next) => db.models.document
    .create({name: req.body.name, content: req.body.content, ownerId: req.user.id})
    .then(() => res.redirect('/documents'))
    .catch(next),
  );

router.route('/document/:id')
  .get((req, res, next) => db.models.document
    .findById(req.params.id, {include: [{model: db.models.user, as: 'owner'}]})
    .then(document => res.render('document', {document}))
    .catch(next),
  );

module.exports = router;
