const { STATUS, HTTP_HEADERS, ERROR_CODES } = require('../utils/constants');
const { truncateString } = require('../utils/helpers');
const logger = require('../utils/logger');

/**
 * Serviços de verificação HTTP - Fetch nativo (Node 18+)
 */

const checkHttp = async (url, timeout = 30) => {
    const result = {
        status: STATUS.UNKNOWN,
        responseTime: '0',
        statusCode: '0',
        error: ''
    };

    const startTime = Date.now();
    const controller = new AbortController();

    const timeoutId = setTimeout(() => {
        controller.abort();
    }, timeout * 1000);

    try {
        logger.debug(`Verificando HTTP: ${url}`);

        const response = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
            headers: {
                'User-Agent': HTTP_HEADERS.USER_AGENT
            },
            redirect: 'follow'
        });

        clearTimeout(timeoutId);

        const responseTime = Date.now() - startTime;
        result.responseTime = responseTime.toString();
        result.statusCode = response.status.toString();

        if (response.status === 200) {
            result.status = STATUS.UP;
            logger.debug(`HTTP OK: ${url} (${responseTime}ms)`);
        } else {
            result.status = STATUS.DOWN;
            result.error = `HTTP ${response.status}`;
            logger.warn(`HTTP ${response.status}: ${url}`);
        }

    } catch (error) {
        clearTimeout(timeoutId);

        const responseTime = Date.now() - startTime;
        result.responseTime = responseTime.toString();
        result.status = STATUS.DOWN;

        if (error.name === ERROR_CODES.ABORT_ERROR) {
            result.error = `Timeout após ${timeout}s`;
            result.responseTime = (timeout * 1000).toString();
            logger.warn(`Timeout: ${url} após ${timeout}s`);

        } else if (error.message.includes('certificate') || error.message.includes('SSL')) {
            result.error = `Erro SSL: ${truncateString(error.message)}`;
            logger.warn(`SSL Error: ${url}`);

        } else if (error.code === ERROR_CODES.CONNECTION_REFUSED ||
            error.code === ERROR_CODES.NOT_FOUND ||
            error.message.includes('ECONNREFUSED') ||
            error.message.includes('ENOTFOUND')) {
            result.error = `Erro de conexão: ${truncateString(error.message)}`;
            logger.warn(`Connection Error: ${url}`);

        } else {
            result.error = truncateString(error.message);
            logger.warn(`General Error: ${url} - ${error.message}`);
        }
    }

    return result;
};

const isUrlReachable = async (url, timeout = 10) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout * 1000);

    try {
        const response = await fetch(url, {
            method: 'HEAD',
            signal: controller.signal,
            headers: {
                'User-Agent': HTTP_HEADERS.USER_AGENT
            }
        });

        clearTimeout(timeoutId);
        return response.status >= 200 && response.status < 400;

    } catch {
        clearTimeout(timeoutId);
        return false;
    }
};

module.exports = {
    checkHttp,
    isUrlReachable
};