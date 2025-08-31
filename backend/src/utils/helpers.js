const crypto = require('crypto');

/**
 * Funções utilitárias - CommonJS
 */

const generateUUID = () => {
    return crypto.randomUUID();
};

const sleep = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

const getCurrentTimestamp = () => {
    return Date.now().toString();
};

const calculateDaysUntilExpiry = (expiryDate) => {
    const days = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days.toString();
};

const extractHostname = (url) => {
    try {
        return new URL(url).hostname;
    } catch {
        return 'Invalid URL';
    }
};

const isHttps = (url) => {
    return url?.startsWith('https') || false;
};

const truncateString = (str, maxLength = 100) => {
    if (!str) return '';
    return str.length > maxLength ? str.substring(0, maxLength) : str;
};

const toString = (value) => {
    if (value === null || value === undefined) return '';
    return value.toString();
};

const safeParseInt = (value, defaultValue = 30) => {
    const parsed = parseInt(value);
    return isNaN(parsed) ? defaultValue : parsed;
};

const marshallItem = (item) => {
    const marshalled = {};
    for (const [key, value] of Object.entries(item)) {
        marshalled[key] = { S: toString(value) };
    }
    return marshalled;
};

const unmarshallItem = (item) => {
    if (!item) return {};

    const unmarshalled = {};
    for (const [key, value] of Object.entries(item)) {
        if (value.S !== undefined) {
            unmarshalled[key] = value.S;
        } else if (value.N !== undefined) {
            unmarshalled[key] = value.N;
        } else if (value.BOOL !== undefined) {
            unmarshalled[key] = value.BOOL;
        }
    }
    return unmarshalled;
};

module.exports = {
    generateUUID,
    sleep,
    getCurrentTimestamp,
    calculateDaysUntilExpiry,
    extractHostname,
    isHttps,
    truncateString,
    toString,
    safeParseInt,
    marshallItem,
    unmarshallItem
};