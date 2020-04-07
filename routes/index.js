'use strict';

const bcrypt = require('bcrypt');
const express = require('express');
const logger = require('heroku-logger');
const passport = require('passport');
const pdf = require('html-pdf');
const pug = require('pug');

const admin = require('./admin');
const api = require('./api');
const authenticated = require('./authenticated');
const db = require('../db');
const loggedout = require('./loggedout');

function loginRedirect(req, res, next) {
  if (req.user) {
    next();
  } else {
    req.session.loginReferrer = req.originalUrl;
    res.redirect('/login');
  }
}

function forceAdmin(req, res, next) {
  if (req.isAdmin) {
    next();
  } else {
    res.status(403).render('error', {message: 'You are not an admin.'});
  }
}

function errorHandler(err, req, res, next) {
  logger.error(err);
  if (res.headersSent) {
    return;
  }
  res.status(500).render('error', {message: err.message, details: err.stack});
}

const router = express.Router();

router.use((req, res, next) => {
  const adminID = parseInt(process.env.ADMIN_ID) || 1;
  req.isAdmin = req.user && (req.user.id === adminID);
  next();
});

router.route('/download/:id')
  .get((req, res, next) => db.models.document.findById(
      req.params.id, {
        include: [{model: db.models.user, as: 'owner'}],
      },
    )
    .then(document => {
      const html = pug.compileFile('./views/pdf.pug');
      pdf
        .create(
          html({document}),
          {
            border: {
              top: '15mm',
              right: '10mm',
              bottom: '15mm',
              left: '10mm',
            },
            footer: {
              height: '10mm',
              contents: {
                default: document.owner.username,
              },
            },
          },
        )
        .toStream((err, stream) => {
          if (err) {
            return next(err);
          }
          res.attachment('taaskly-doc.pdf');
          stream.pipe(res);
        });
    })
    .catch(next),
  );

router.use('/api', api);
router.use(loggedout);
router.use(loginRedirect);
router.use(authenticated);
router.use('/admin', forceAdmin, admin);
router.use(errorHandler);

module.exports = router;
