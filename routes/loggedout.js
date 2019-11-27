'use strict';

const base64url = require('base64url');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const logger = require('heroku-logger');
const Op = require('sequelize').Op;
const passport = require('passport');
const request = require('request-promise-native');

const db = require('../db');
const graph = require('../graph');

const router = express.Router();

router.route('/')
  .get((req, res, next) => res.render('home'));

router.route('/login')
  .get((req, res, next) => res.render('login', {
    appID: process.env.APP_ID,
    graphVersion: process.env.GRAPH_VERSION || 'v3.2',
    redirectURI: process.env.APP_REDIRECT,
    userRedirectURI: process.env.APP_USER_REDIRECT,
  }))
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

router.route('/page_install')
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
        redirect_uri: process.env.BASE_URL + '/page_install',
        code: req.query.code,
      })
      .send()
      .then(tokenResponse => {
        return Promise.all([
          graph('me')
            .token(tokenResponse.access_token)
            .qs({ fields: 'name' })
            .send(),
          graph('community')
            .token(tokenResponse.access_token)
            .qs({ fields: 'install,name' })
            .send()
        ])
        .then(responses => {
          const pageResponse = responses[0];
          const communityResponse = responses[1];
          return db.models.page.create({
            id: pageResponse.id,
            name: pageResponse.name,
            accessToken: tokenResponse.access_token,
            communityId: communityResponse.id,
            communityName: communityResponse.name,
            installId: communityResponse.install.id,
          });
        })}
      )
      .then(page => {
        const state = req.query.state;
        res.render('pageInstallSuccess', {page, state});
      })
      .catch(next);
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
      .then(tokenResponse => {
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
          );
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

router.route('/user_install')
  .get((req, res, next) => {
    genObtainIdTokenPayload(req)
      .then(token => {
        const workplaceID = token.sub;
        if (req.user) {
          req.user
            .update({workplaceID: workplaceID})
            .then(() => res.render(
              'userInstallSuccess',
              {token, message: 'Linked your Taaskly account with your Workplace account.'}
            ));
        } else {
          const user = db.models.user.findOne({where: {workplaceID: workplaceID}})
            .then(user => {
              if (user) {
                req.login(user, err => {
                  if (err) {
                    return res.render(
                      'userInstallSuccess',
                      {token, message: 'Obtained id_token, but could not establish session.'}
                    );
                  }
                  return res.render(
                    'userInstallSuccess',
                    {token, message: 'Logged you in. You can close this window and refresh the main window.'}
                  );
                });
              } else {
                return res.render('userInstallSuccess', {token});
              }
            });
        }
      });
  });

router.route('/android')
  .get((req, res, next) => res.render('android'));

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

router.route('/device')
  .get((req, res, next) => {
    graph('device/login')
      .post()
      .clientToken()
      .send()
      .then(deviceLogin => res.render('deviceLogin', {deviceLogin}))
  })
  .post((req, res, next) => {
    graph('device/login_status')
      .post()
      .clientToken()
      .qs({code: req.body.code})
      .send()
      .then(response => {
        console.log(response);
        res.render('debug', {details: response});
      });
  });

function handleIDToken(req, idToken) {
  return request('https://www.jokr.sb.workplace.com/.well-known/openid/', { json: true, strictSSL: false})
    .then(pubKeys => verifyToken(pubKeys.keys, idToken))
    .then(decodedToken => {
      const workplaceID = decodedToken.sub;
      if (req.user) {
        return req.user.update({workplaceID: workplaceID})
          .then(user => [user, decodedToken]);
      } else {
        return db.models.user.findOne({where: {workplaceID: workplaceID}})
          .then(user => {
            if (user) {
              return new Promise((resolve, reject) => req.login(user, err => {
                if (err) reject(err);
                return resolve(user);
              }));
            }
            return null;
          })
          .then(user => [user, decodedToken]);
      }
    });
}

function genObtainIdTokenPayload(req) {
  return request('https://www.workplace.com/.well-known/openid/', { json: true })
    .then(pubKeys => {
      if (req.query.id_token) {
        return verifyToken(pubKeys.keys, req.query.id_token);
      }
      return graph('oauth/access_token')
        .qs({
          client_id: process.env.APP_ID,
          client_secret: process.env.APP_SECRET,
          redirect_uri: process.env.BASE_URL + 'user_install',
          code: req.query.code,
          grant_type: 'authorization_code',
        })
        .send()
        .then(accessTokenResponse => verifyToken(pubKeys.keys, accessTokenResponse.id_token));
    });
}

function verifyToken(keys, idToken) {
  return new Promise((resolve, reject) => {
    const unverifiedToken = jwt.decode(idToken, {complete: true});
    const pubKey = keys[unverifiedToken.header.kid];
    const options = {
      algorithms: ['RS256'],
      audience: process.env.APP_ID,
      issuer: 'https://workplace.com'
    };
    jwt.verify(idToken, pubKey, options, (err, decoded) => err ? reject(err) : resolve(decoded));
  });
}

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
