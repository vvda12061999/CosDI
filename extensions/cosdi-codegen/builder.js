'use strict';

/**
 * The build plugin entry. Creator reads `contributions.builder` in
 * package.json, loads this, and runs the hooks it points at for every
 * platform, which is where the DI in the project is read.
 */

exports.load = function () {};

exports.unload = function () {};

exports.configs = {
    '*': {
        hooks: './build-hooks.js',
    },
};
