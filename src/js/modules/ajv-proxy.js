const Ajv = require('ajv');

const logger = require('./logger')('ajv-proxy');
const {Sandbox} = require('./messaging');
/**
 * This module provides an interface to Ajv that works in restricted
 * contexts, assuming a sandbox page has been made available.
 * 
 * Where unrestricted, Ajv is run directly.
 * 
 * Because request/response is required for sandboxed pages, we
 * also restrict the normal interface to be promise-based.
 */

// Whether we're on a page that disallows 'unsafe-eval'
function isRestricted() {
  try {
    let fn = new Function('return false');
    return fn();
  } catch(e) {
    return true;
  }
}

if (isRestricted()) {
  let sandbox = new Sandbox('html/ajv-sandbox.html');

  // Ajv interface to sandboxed page.
  module.exports = class {
    constructor() {
      sandbox.postMessage()

    }

    // Pass-through.
    addSchema(...args) {

    }

    // Pass-through.
    validate(...args) {

    }

    // Pass-through.
    errorsText() {

    }
  };
} else {
  throw new Error('Non-sandboxed ajv interface not implemented.');
}
