'use strict';

const bcrypt = require('bcrypt');
const LocalStrategy = require('passport-local').Strategy;
const passport = require('passport');

const db = require('./db');

passport.use(new LocalStrategy((username, password, done) => {
  db.models.user
    .findOne({where: { username: username }})
    .then(user => {
      if (!user) {
        return done(null, false, { message: 'Incorrect username.' });
      }
      return bcrypt.compare(password, user.passwordHash)
        .then(result => {
          console.log(result);
          if (result) {
            return done(null, user);
          } else {
            return done(null, false, { message: 'Incorrect password.' });
          }
        });
    })
    .catch(err => {
      done(err);
    });
}));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  db.models.user
    .findById(id)
    .then(user => done(null, user))
    .catch(err => done(err));
});

module.exports = passport;
