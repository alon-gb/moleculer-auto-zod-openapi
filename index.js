const settings = require("./settings");
const actions = require("./actions");
const methods = require("./methods");

/*
 * Inspired by https://github.com/icebob/kantab/blob/fd8cfe38d0e159937f4e3f2f5857c111cadedf44/backend/mixins/openapi.mixin.js
 * and https://github.com/grinat/moleculer-auto-openapi
 */
module.exports = {
  name: 'openapi',
  settings,
  actions,
  methods,
  started() {
    this.logger.info(`📜OpenAPI Docs server is available at http://0.0.0.0:${this.settings.port}${this.settings.uiPath}`);
  }
};
