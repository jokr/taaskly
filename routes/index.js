'use strict';

const bcrypt = require('bcrypt');
const express = require('express');
const logger = require('heroku-logger');
const passport = require('passport');

const db = require('../db');
const loggedout = require('./loggedout');
const authenticated = require('./authenticated');

function loginRedirect(req, res, next) {
  if (req.user) {
    next();
  } else {
    res.redirect('/login');
  }
}

function errorHandler(err, req, res, next) {
  logger.error(err);
  res.status(500).render('error', {message: err.message, details: err.stack});
}

const router = express.Router();

router.use(loggedout);
router.use(loginRedirect);
router.use(authenticated);
router.use(errorHandler);

module.exports = router;
