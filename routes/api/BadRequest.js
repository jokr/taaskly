'use strict';

class BadRequest extends Error {
  constructor(message) {
    super();
    this.name = "BadRequest";
    this.message = (message || "");
    Error.captureStackTrace(this);
  }
}

module.exports = BadRequest;
