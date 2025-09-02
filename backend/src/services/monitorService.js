const { saveMonitor, updateMonitorResult } = require('./dynamoService');
const { checkHttp } = require('./httpService');
const { checkSSL } = require('./sslService');

const prepareMonitor = async (monitor) => {
    // Validação inline
    if (!monitor?.url || !monitor?.monitorId) {
        console.error(`[ERROR] Monitor inválido: ${monitor?.url || 'N/A'}`);
        return null;
    }

    try {
        new URL(monitor.url);
    } catch {
        console.error(`[ERROR] URL inválida: ${monitor.url}`);
        return null;
    }

    // Aplicar defaults
    const updatedMonitor = {
        ...monitor,
        timeout: monitor.timeout || 30,
        isActive: monitor.isActive ?? true,
        createdAt: monitor.createdAt || Date.now()
    };

    // Salvar se aplicou defaults
    const needsUpdate = !monitor.timeout || monitor.isActive === undefined || !monitor.createdAt;

    if (needsUpdate) {
        console.warn(`[WARN] Monitor ${monitor.alias || monitor.url} - aplicando defaults`);
        await saveMonitor(updatedMonitor);
    }

    return updatedMonitor;
};

const executeMonitoring = async (monitor) => {
    const { monitorId, url, alias, timeout } = monitor;

    console.log(`[INFO] Verificando ${alias || url}`);

    try {
        // HTTP check
        const httpResult = await checkHttp(url, timeout);

        // SSL check apenas para HTTPS
        let sslResult = {};
        if (url.startsWith('https')) {
            sslResult = await checkSSL(url);
        }

        // Salvar resultado
        const saved = await updateMonitorResult(monitorId, httpResult, sslResult);
        console.log(`[INFO] ${alias || url}: ${httpResult.status} (${httpResult.responseTime}ms)`);

        return {
            monitorId,
            alias,
            status: httpResult.status,
            responseTime: httpResult.responseTime,
            success: saved
        };

    } catch (error) {
        console.error(`[ERROR] ${alias || url}:`, error.message);
        return {
            monitorId,
            alias: alias || 'Unknown',
            status: 'UNKNOWN',
            responseTime: 0,
            success: false,
            error: error.message
        };
    }
};

const processMonitor = async (monitor) => {
    try {
        const preparedMonitor = await prepareMonitor(monitor);

        if (!preparedMonitor || !preparedMonitor.isActive) {
            return null;
        }

        return await executeMonitoring(preparedMonitor);
    } catch (error) {
        console.error('[ERROR] Erro ao processar monitor:', error.message);
        return null;
    }
};

const processMonitors = async (monitors) => {
    return await Promise.all(
        monitors.map(monitor => processMonitor(monitor))
    );
};

module.exports = {
    processMonitors,
    processMonitor,
    executeMonitoring,
    prepareMonitor
};