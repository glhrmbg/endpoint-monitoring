/**
 * Sistema de logging estruturado - CommonJS
 */

const info = (message, ...args) => {
    console.log(`[INFO] ${message}`, ...args);
};

const error = (message, ...args) => {
    console.error(`[ERROR] ${message}`, ...args);
};

const warn = (message, ...args) => {
    console.warn(`[WARN] ${message}`, ...args);
};

const debug = (message, ...args) => {
    console.log(`[DEBUG] ${message}`, ...args);
};

const performance = (message, timeMs) => {
    info(`[PERF] ${message}: ${timeMs}ms`);
};

module.exports = {
    info,
    error,
    warn,
    debug,
    performance
};