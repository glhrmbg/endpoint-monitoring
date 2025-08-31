/**
 * Constantes da aplicação
 */

const STATUS = {
    UP: 'UP',
    DOWN: 'DOWN',
    UNKNOWN: 'UNKNOWN'
};

const PROTOCOL = {
    HTTP: 'HTTP',
    HTTPS: 'HTTPS'
};

const DEFAULTS = {
    TIMEOUT: 30,
    SSL_PORT: 443,
    TLS_TIMEOUT: 10000,
    MONITOR_DELAY: 500
};

const HTTP_HEADERS = {
    USER_AGENT: 'AWS-Lambda-Monitor/1.0'
};

const ERROR_CODES = {
    TIMEOUT: 'ECONNABORTED',
    CONNECTION_REFUSED: 'ECONNREFUSED',
    NOT_FOUND: 'ENOTFOUND',
    ABORT_ERROR: 'AbortError'
};

module.exports = {
    STATUS,
    PROTOCOL,
    DEFAULTS,
    HTTP_HEADERS,
    ERROR_CODES
};