const { getAllMonitors, saveMonitor, updateMonitorResult } = require('./services/dynamoService');
const { checkHttp } = require('./services/httpService');
const { checkSSL } = require('./services/sslService');
const {
    sleep,
    extractHostname,
    isHttps,
    safeParseInt,
    isValidUrl,
    normalizeBoolean
} = require('./utils/helpers');
const crypto = require('crypto');


const validateMonitor = (monitor) => {
    const errors = [];

    if (!monitor.url || !isValidUrl(monitor.url)) {
        errors.push('URL inválida ou ausente');
    }

    return {
        isValid: errors.length === 0,
        errors
    };
};

const prepareMonitor = async (monitor) => {
    const validation = validateMonitor(monitor);

    if (!validation.isValid) {
        console.error(`[ERROR] Monitor inválido: ${validation.errors.join(', ')}`);
        return {
            ...monitor,
            isActive: false,
            alias: monitor.alias || 'Monitor Inválido'
        };
    }

    let updated = false;
    const currentTimestamp = Date.now().toString();

    // Aplicar defaults apenas se necessário
    const updates = {};

    if (!monitor.monitorId) {
        updates.monitorId = crypto.randomUUID();
        updated = true;
    }

    if (!monitor.type) {
        updates.type = isHttps(monitor.url) ? 'HTTPS' : 'HTTP';
        updated = true;
    }

    if (!monitor.timeout) {
        updates.timeout = '30';
        updated = true;
    }

    if (monitor.isActive === undefined) {
        updates.isActive = true;
        updated = true;
    } else {
        // Normalizar boolean
        const normalizedActive = normalizeBoolean(monitor.isActive);
        if (monitor.isActive !== normalizedActive) {
            updates.isActive = normalizedActive;
            updated = true;
        }
    }

    if (!monitor.createdAt) {
        updates.createdAt = currentTimestamp;
        updated = true;
    }

    if (!monitor.alias) {
        updates.alias = `Monitor - ${extractHostname(monitor.url)}`;
        updated = true;
    }

    const updatedMonitor = { ...monitor, ...updates };

    if (updated) {
        const saved = await saveMonitor(updatedMonitor);
        if (saved) {
            console.log(`[DEBUG] Monitor ${updatedMonitor.alias} atualizado`);
        } else {
            console.error(`[ERROR] Erro ao salvar monitor ${updatedMonitor.alias}`);
        }
    }

    return updatedMonitor;
};

const executeMonitoring = async (monitor) => {
    const { monitorId, url, alias } = monitor;

    console.log(`[INFO] Verificando ${alias}`);

    try {
        const timeout = safeParseInt(monitor.timeout, 30);
        const httpResult = await checkHttp(url, timeout);

        let sslResult = {};
        if (isHttps(url)) {
            console.log(`[DEBUG] Executando checkSSL para ${url}`);
            sslResult = await checkSSL(url);
            console.log(`[DEBUG] SSL result: ${JSON.stringify(sslResult)}`);
        }

        const saved = await updateMonitorResult(monitorId, httpResult, sslResult);

        console.log(`[INFO] ${alias}: ${httpResult.status} (${httpResult.responseTime}ms)`);

        return {
            monitorId,
            alias,
            status: httpResult.status,
            responseTime: httpResult.responseTime,
            success: saved
        };

    } catch (error) {
        console.error(`[ERROR] Erro ao monitorar ${alias}:`, error.message);
        return {
            monitorId,
            alias,
            status: 'UNKNOWN',
            responseTime: '0',
            success: false,
            error: error.message
        };
    }
};

const processMonitor = async (monitor) => {
    try {
        const preparedMonitor = await prepareMonitor(monitor);

        // Skip monitor se inativo
        if (!preparedMonitor.isActive) {
            console.log(`[DEBUG] Monitor ${preparedMonitor.alias} inativo, pulando...`);
            return null;
        }

        const result = await executeMonitoring(preparedMonitor);

        // Delay entre monitores para evitar sobrecarga
        await sleep(500);

        return result;

    } catch (error) {
        console.error(`[ERROR] Erro ao processar monitor ${monitor.monitorId || 'unknown'}:`, error.message);
        return {
            monitorId: monitor.monitorId || 'unknown',
            alias: monitor.alias || 'Unknown Monitor',
            status: 'UNKNOWN',
            responseTime: '0',
            success: false,
            error: error.message
        };
    }
};



const calculateStats = (results) => {
    const validResults = results.filter(r => r !== null);

    return {
        totalProcessed: validResults.length,
        successfulChecks: validResults.filter(r => r.success).length,
        upMonitors: validResults.filter(r => r.status === 'UP').length,
        downMonitors: validResults.filter(r => r.status === 'DOWN').length,
        unknownMonitors: validResults.filter(r => r.status === 'UNKNOWN').length
    };
};



const handler = async (event, context) => {
    const startTime = Date.now();

    try {
        console.log('[INFO] === Iniciando monitoramento CONCORRENTE de endpoints ===');

        const monitors = await getAllMonitors();
        console.log(`[INFO] Encontrados ${monitors.length} monitores`);

        if (monitors.length === 0) {
            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: 'Nenhum monitor encontrado',
                    totalProcessed: 0,
                    successfulChecks: 0,
                    upMonitors: 0,
                    downMonitors: 0,
                    unknownMonitors: 0,
                    results: []
                })
            };
        }

        // Processamento CONCORRENTE com Promise.all
        const results = await Promise.all(
            monitors.map(monitor => processMonitor(monitor))
        );

        const validResults = results.filter(r => r !== null);
        const executionTime = Date.now() - startTime;
        const stats = calculateStats(validResults);

        // Log do resultado
        console.log('[INFO] === Monitoramento concluído ===');
        console.log(`[INFO] Total: ${stats.totalProcessed}`);
        console.log(`[INFO] Sucesso: ${stats.successfulChecks}`);
        console.log(`[INFO] UP: ${stats.upMonitors} | DOWN: ${stats.downMonitors} | UNKNOWN: ${stats.unknownMonitors}`);
        console.log(`[PERF] Execução total: ${executionTime}ms`);

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Monitoramento concluído com sucesso',
                totalProcessed: stats.totalProcessed,
                successfulChecks: stats.successfulChecks,
                upMonitors: stats.upMonitors,
                downMonitors: stats.downMonitors,
                unknownMonitors: stats.unknownMonitors,
                executionTimeMs: executionTime,
                results: validResults
            })
        };

    } catch (error) {
        const executionTime = Date.now() - startTime;
        console.error('[ERROR] Erro fatal no monitoramento:', error.message);

        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Erro interno do servidor',
                message: error.message,
                executionTimeMs: executionTime
            })
        };
    }
};

module.exports = { handler };