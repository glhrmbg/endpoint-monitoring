const { getAllMonitors } = require('./services/dynamoService');
const { processMonitors } = require('./services/monitorService');

const calculateStats = (results) => {
    const validResults = results.filter(Boolean);
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
        console.log('[INFO] Iniciando monitoramento');

        const monitors = await getAllMonitors();
        if (monitors.length === 0) {
            return {
                statusCode: 200,
                body: JSON.stringify({ message: 'Nenhum monitor encontrado' })
            };
        }

        // Delegar processamento para o service
        const results = await processMonitors(monitors);
        const stats = calculateStats(results);
        const executionTime = Date.now() - startTime;

        console.log(`[INFO] Concluído: UP:${stats.upMonitors} DOWN:${stats.downMonitors} (${executionTime}ms)`);

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Monitoramento concluído',
                ...stats,
                executionTimeMs: executionTime,
                results: results.filter(Boolean)
            })
        };

    } catch (error) {
        const executionTime = Date.now() - startTime;
        console.error('[ERROR] Erro fatal:', error.message);

        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Erro interno',
                message: error.message,
                executionTimeMs: executionTime
            })
        };
    }
};

module.exports = { handler };