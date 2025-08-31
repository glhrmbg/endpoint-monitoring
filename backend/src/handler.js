const { getAllMonitors, saveMonitor, updateMonitorResult } = require('./services/dynamoService');
const { checkHttp } = require('./services/httpService');
const { checkSSL } = require('./services/sslService');
const { STATUS, PROTOCOL, DEFAULTS } = require('./utils/constants');
const {
    generateUUID,
    sleep,
    getCurrentTimestamp,
    extractHostname,
    isHttps,
    safeParseInt
} = require('./utils/helpers');
const logger = require('./utils/logger');

/**
 * Handler principal - Versão HÍBRIDA CommonJS
 */

const prepareMonitor = async (monitor) => {
    let updated = false;
    const currentTimestamp = getCurrentTimestamp();

    const defaults = {
        monitorId: monitor.monitorId || generateUUID(),
        type: isHttps(monitor.url) ? PROTOCOL.HTTPS : PROTOCOL.HTTP,
        timeout: monitor.timeout?.toString() || DEFAULTS.TIMEOUT.toString(),
        isActive: monitor.isActive !== undefined ? monitor.isActive : true, // Boolean padrão
        createdAt: monitor.createdAt || currentTimestamp
    };

    for (const [field, defaultValue] of Object.entries(defaults)) {
        if (monitor[field] === undefined) {
            monitor[field] = defaultValue;
            updated = true;
        }
    }

    // Converter string para boolean se necessário
    if (typeof monitor.isActive === 'string') {
        monitor.isActive = monitor.isActive === 'true';
        updated = true;
    }

    if (!monitor.alias) {
        monitor.alias = `Monitor - ${extractHostname(monitor.url)}`;
        updated = true;
    }

    if (!monitor.url) {
        logger.error('Monitor sem URL encontrado');
        monitor.isActive = false;
        return monitor;
    }

    if (updated) {
        await saveMonitor(monitor);
        logger.debug(`Monitor ${monitor.alias} atualizado`);
    }

    return monitor;
};

const executeMonitoring = async (monitor) => {
    const { monitorId, url, alias } = monitor;

    logger.info(`Verificando ${alias}`);

    try {
        const timeout = safeParseInt(monitor.timeout, DEFAULTS.TIMEOUT);
        const httpResult = await checkHttp(url, timeout);

        let sslResult = {};
        if (isHttps(url)) {
            logger.debug(`Executando checkSSL para ${url}`);
            sslResult = await checkSSL(url);
            logger.debug(`SSL result: ${JSON.stringify(sslResult)}`);
        }

        const saved = await updateMonitorResult(monitorId, httpResult, sslResult);

        logger.info(`${alias}: ${httpResult.status} (${httpResult.responseTime}ms)`);

        return {
            monitorId,
            alias,
            status: httpResult.status,
            responseTime: httpResult.responseTime,
            success: saved
        };

    } catch (error) {
        logger.error(`Erro ao monitorar ${alias}:`, error.message);
        return createErrorResult(monitor, error);
    }
};

const processMonitor = async (monitor) => {
    try {
        const preparedMonitor = await prepareMonitor(monitor);

        // Verificar isActive como boolean
        if (preparedMonitor.isActive === false) {
            logger.debug(`Monitor ${preparedMonitor.alias} inativo, pulando...`);
            return null;
        }

        const result = await executeMonitoring(preparedMonitor);
        await sleep(DEFAULTS.MONITOR_DELAY);

        return result;

    } catch (error) {
        logger.error(`Erro ao processar monitor ${monitor.monitorId}:`, error.message);
        return createErrorResult(monitor, error);
    }
};

const createErrorResult = (monitor, error) => {
    return {
        monitorId: monitor.monitorId || 'unknown',
        alias: monitor.alias || 'Unknown Monitor',
        status: STATUS.UNKNOWN,
        responseTime: '0',
        success: false,
        error: error.message
    };
};

const calculateStats = (results) => {
    const validResults = results.filter(r => r !== null);

    return {
        totalProcessed: validResults.length,
        successfulChecks: validResults.filter(r => r.success).length,
        upMonitors: validResults.filter(r => r.status === STATUS.UP).length,
        downMonitors: validResults.filter(r => r.status === STATUS.DOWN).length,
        unknownMonitors: validResults.filter(r => r.status === STATUS.UNKNOWN).length
    };
};

const logFinalStats = (results, executionTime) => {
    const stats = calculateStats(results);

    logger.info('=== Monitoramento concluído ===');
    logger.info(`Total: ${stats.totalProcessed}`);
    logger.info(`Sucesso: ${stats.successfulChecks}`);
    logger.info(`UP: ${stats.upMonitors} | DOWN: ${stats.downMonitors} | UNKNOWN: ${stats.unknownMonitors}`);
    logger.performance('Execução total', executionTime);
};

const handler = async (event, context) => {
    const startTime = Date.now();

    try {
        logger.info('=== Iniciando monitoramento CONCORRENTE de endpoints ===');

        const monitors = await getAllMonitors();
        logger.info(`Encontrados ${monitors.length} monitores`);

        if (monitors.length === 0) {
            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: 'No monitors found',
                    ...calculateStats([]),
                    results: []
                })
            };
        }

        // Processamento CONCORRENTE
        const results = await Promise.all(
            monitors.map(monitor => processMonitor(monitor))
        );

        const validResults = results.filter(r => r !== null);
        const executionTime = Date.now() - startTime;

        logFinalStats(validResults, executionTime);

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Monitoring completed successfully',
                ...calculateStats(validResults),
                executionTimeMs: executionTime,
                results: validResults
            })
        };

    } catch (error) {
        const executionTime = Date.now() - startTime;
        logger.error('Erro fatal no monitoramento:', error.message);

        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Internal server error',
                message: error.message,
                executionTimeMs: executionTime
            })
        };
    }
};

module.exports = { handler };