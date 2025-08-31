const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

const isHttps = (url) => url?.startsWith('https') || false;

const safeParseInt = (value, defaultValue = 30) => {
    const parsed = parseInt(value);
    return isNaN(parsed) ? defaultValue : parsed;
};

const isValidUrl = (url) => {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
};

const normalizeBoolean = (value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.toLowerCase() === 'true';
    return Boolean(value);
};

module.exports = {
    sleep,
    calculateDaysUntilExpiry,
    extractHostname,
    isHttps,
    safeParseInt,
    isValidUrl,
    normalizeBoolean
};