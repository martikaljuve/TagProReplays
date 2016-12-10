// Script to be loaded into sandboxed page.
const Ajv = require('ajv');

const logger = require('./modules/logger')('ajv-sandboxed');
const {registerSandbox} = require('./modules/messaging');

class ClassManager {
  constructor(klass) {
    this.klass = klass;
    this.instances = new Map();
    this.instance_ids = 0;
  }

  construct(args = []) {
    let ref = this.instance_ids++;
    this.instances.set(ref, new this.klass(...args));
    return ref;
  }

  destruct(ref) {
    this.instances.delete(ref);
  }

  call(id, method, args) {
    return this.instances.get(id)[method](...args);
  }
}

let manager = new ClassManager(Ajv);

// Set up handlers for controlling Ajv instances.
registerSandbox((message) => {

});