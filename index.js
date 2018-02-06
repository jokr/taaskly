'use strict';

const bodyParser = require('body-parser');
const env = require('node-env-file');
const express = require('express');
const logger = require('heroku-logger')
const morgan = require('morgan');

env(__dirname + '/.env', {raise: false});

const app = express();
app.set('port', (process.env.PORT || 5000));
app.set('view engine', 'pug');
app.set('json spaces', 2);

app.use(bodyParser.urlencoded({ extended: false }));

app.use(morgan(':method :url :status :response-time ms'));

app.listen(app.get('port'), () => {
  logger.info(`App is running on port ${app.get('port')}.`);
});
