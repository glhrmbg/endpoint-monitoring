const { saveMonitor, updateMonitorResult } = require('./dynamoService');
const { checkHttp } = require('./httpService');
const { checkSSL } = require('./sslService');

const validateMonitor = (monitor) => {
    const errors = [];

    if (!monitor?.monitorId) {
        errors.push('Missing monitorId');
    }

    if (!monitor?.url) {
        errors.push('Missing url');
    }

    if (monitor.url) {
        try {
            const urlObj = new URL(monitor.url);
            if (!['http:', 'https:'].includes(urlObj.protocol)) {
                errors.push('URL must use HTTP or HTTPS protocol');
            }
        } catch {
            errors.push('Invalid URL format');
        }
    }

    if (monitor.timeout && (typeof monitor.timeout !== 'number' || monitor.timeout < 1 || monitor.timeout > 300)) {
        errors.push('Timeout must be a number between 1 and 300 seconds');
    }

    return errors;
};

const prepareMonitor = async (monitor) => {
    const validationErrors = validateMonitor(monitor);

    if (validationErrors.length > 0) {
        console.error(`Invalid monitor configuration for ${monitor?.monitorId || 'unknown'}:`, validationErrors);
        return null;
    }

    // Apply defaults
    const updatedMonitor = {
        ...monitor,
        timeout: Number(monitor.timeout) || 30,
        isActive: monitor.isActive ?? true,
        createdAt: monitor.createdAt || Date.now()
    };

    // Ensure timeout is within bounds
    updatedMonitor.timeout = Math.max(5, Math.min(300, updatedMonitor.timeout));

    // Save if defaults were applied
    const needsUpdate = !monitor.timeout ||
        monitor.isActive === undefined ||
        !monitor.createdAt;

    if (needsUpdate) {
        console.warn(`Applying default values to monitor: ${monitor.alias || monitor.url} (ID: ${monitor.monitorId})`);
        const saved = await saveMonitor(updatedMonitor);
        if (!saved) {
            console.error(`Failed to save updated monitor: ${monitor.monitorId}`);
        }
    }

    return updatedMonitor;
};

const executeMonitoring = async (monitor) => {
    const { monitorId, url, alias, timeout } = monitor;
    const displayName = alias || url;

    console.log(`Starting health check for: ${displayName}`);

    try {
        // HTTP check
        const httpResult = await checkHttp(url, timeout);

        if (!httpResult || typeof httpResult !== 'object') {
            throw new Error('Invalid HTTP check result');
        }

        console.log(`HTTP check completed for ${displayName}: ${httpResult.status} (${httpResult.responseTime}ms)`);

        // SSL check for HTTPS only
        let sslResult = {};
        if (url.startsWith('https')) {
            console.log(`Performing SSL check for: ${displayName}`);
            sslResult = await checkSSL(url);

            if (sslResult.error) {
                console.warn(`SSL check warning for ${displayName}: ${sslResult.error}`);
            }
        }

        // Save result to database
        const saved = await updateMonitorResult(monitorId, httpResult, sslResult);
        if (!saved) {
            console.error(`Failed to save monitoring result for: ${displayName}`);
        }

        console.log(`Health check completed for ${displayName}: ${httpResult.status}`);

        return {
            monitorId,
            alias: displayName,
            url,
            status: httpResult.status,
            responseTime: httpResult.responseTime,
            statusCode: httpResult.statusCode,
            success: saved,
            sslInfo: Object.keys(sslResult).length > 0 ? sslResult : undefined,
            error: httpResult.error || (!saved ? 'Failed to save result' : undefined)
        };

    } catch (error) {
        console.error(`Health check failed for ${displayName}: ${error.message}`);

        return {
            monitorId,
            alias: displayName,
            url,
            status: 'UNKNOWN',
            responseTime: 0,
            statusCode: 0,
            success: false,
            error: error.message
        };
    }
};

const processMonitor = async (monitor) => {
    try {
        if (!monitor || typeof monitor !== 'object') {
            console.error('Invalid monitor object received');
            return null;
        }

        const preparedMonitor = await prepareMonitor(monitor);

        if (!preparedMonitor) {
            console.warn(`Skipping invalid monitor: ${monitor?.monitorId || 'unknown'}`);
            return null;
        }

        if (!preparedMonitor.isActive) {
            console.log(`Skipping inactive monitor: ${preparedMonitor.alias || preparedMonitor.url} (ID: ${preparedMonitor.monitorId})`);
            return {
                monitorId: preparedMonitor.monitorId,
                alias: preparedMonitor.alias || preparedMonitor.url,
                status: 'INACTIVE',
                responseTime: 0,
                success: true,
                skipped: true
            };
        }

        return await executeMonitoring(preparedMonitor);
    } catch (error) {
        console.error(`Failed to process monitor ${monitor?.monitorId || 'unknown'}:`, error.message);
        return {
            monitorId: monitor?.monitorId || 'unknown',
            alias: monitor?.alias || monitor?.url || 'unknown',
            status: 'ERROR',
            responseTime: 0,
            success: false,
            error: error.message
        };
    }
};

const processMonitors = async (monitors) => {
    if (!Array.isArray(monitors)) {
        throw new Error('Monitors must be an array');
    }

    console.log(`Processing ${monitors.length} monitors concurrently`);

    const startTime = Date.now();
    const results = await Promise.all(
        monitors.map(monitor => processMonitor(monitor))
    );
    const processingTime = Date.now() - startTime;

    const validResults = results.filter(Boolean);
    console.log(`Monitor processing completed: ${validResults.length}/${monitors.length} monitors processed in ${processingTime}ms`);

    return results;
};

module.exports = {
    processMonitors,
    processMonitor,
    executeMonitoring,
    prepareMonitor,
    validateMonitor
};