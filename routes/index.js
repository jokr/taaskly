'use strict';

const bcrypt = require('bcrypt');
const express = require('express');
const logger = require('heroku-logger');
const passport = require('passport');

const admin = require('./admin');
const api = require('./api');
const authenticated = require('./authenticated');
const db = require('../db');
const loggedout = require('./loggedout');

function loginRedirect(req, res, next) {
  if (req.user) {
    next();
  } else {
    let host = req.hostname;
    if (req.app.get('port') !== 80) {
      host += `:${req.app.get('port')}`;
    }
    req.session.loginReferrer = `${req.protocol}://${host}${req.originalUrl}`;
    res.redirect('/login');
  }
}

function forceAdmin(req, res, next) {
  console.log('yolo', req.isAdmin);
  if (req.isAdmin) {
    next();
  } else {
    res.status(403).render('error', {message: 'You are not an admin.'});
  }
}

function errorHandler(err, req, res, next) {
  logger.error(err);
  res.status(500).render('error', {message: err.message, details: err.stack});
}

const router = express.Router();

router.use((req, res, next) => {
  req.isAdmin = req.user && req.user.id === 1;
  next();
})

router.use((req, res, next) => {
  const navigation = [];
  if (req.user) {
    navigation.push({name: 'Documents', path: '/documents'});
    navigation.push({name: 'Messages', path: '/messages'});
    if (req.isAdmin) {
      navigation.push({name: 'Admin', path: '/admin'});
    }
  }
  res.locals.navigation = navigation;
  next();
});

router.use(loggedout);
router.use('/api', api);
router.use(loginRedirect);
router.use(authenticated);
router.use('/admin', forceAdmin, admin);
router.use(errorHandler);

module.exports = router;
