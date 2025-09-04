const { getAllMonitors } = require('./services/dynamoService');
const { processMonitors } = require('./services/monitorService');

const calculateStats = (results) => {
    const validResults = results.filter(Boolean);
    return {
        totalProcessed: validResults.length,
        totalMonitors: results.length,
        successfulChecks: validResults.filter(r => r.success).length,
        failedChecks: validResults.filter(r => !r.success).length,
        upMonitors: validResults.filter(r => r.status === 'UP').length,
        downMonitors: validResults.filter(r => r.status === 'DOWN').length,
        unknownMonitors: validResults.filter(r => r.status === 'UNKNOWN').length,
        averageResponseTime: validResults.length > 0
            ? Math.round(validResults.reduce((sum, r) => sum + (r.responseTime || 0), 0) / validResults.length)
            : 0
    };
};

const handler = async (event, context) => {
    const startTime = Date.now();

    try {
        console.log('Starting endpoint monitoring process');

        const monitors = await getAllMonitors();
        if (!Array.isArray(monitors)) {
            throw new Error('Invalid monitors data received from database');
        }

        if (monitors.length === 0) {
            console.log('No monitors found in database');
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: 'No monitors found',
                    timestamp: new Date().toISOString()
                })
            };
        }

        console.log(`Processing ${monitors.length} monitors`);

        const results = await processMonitors(monitors);
        const stats = calculateStats(results);
        const executionTime = Date.now() - startTime;

        console.log(`Monitoring completed: UP=${stats.upMonitors} DOWN=${stats.downMonitors} UNKNOWN=${stats.unknownMonitors} (${executionTime}ms)`);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                message: 'Monitoring completed successfully',
                timestamp: new Date().toISOString(),
                ...stats,
                executionTimeMs: executionTime,
                results: results.filter(Boolean)
            })
        };

    } catch (error) {
        const executionTime = Date.now() - startTime;

        console.error('Fatal error during monitoring execution:', error.message);

        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: false,
                error: 'Internal server error',
                message: 'Monitoring process failed',
                timestamp: new Date().toISOString(),
                executionTimeMs: executionTime
            })
        };
    }
};

module.exports = { handler };