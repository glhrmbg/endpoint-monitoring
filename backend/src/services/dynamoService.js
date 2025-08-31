const { DynamoDBClient, ScanCommand, PutItemCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

// Inicialização direta - sem arquivo de config desnecessário
const dynamoClient = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1'
});

const MONITORS_TABLE = process.env.MONITORS_TABLE || 'Monitors';

const getAllMonitors = async () => {
    try {
        const command = new ScanCommand({
            TableName: MONITORS_TABLE
        });

        const response = await dynamoClient.send(command);
        return (response.Items || []).map(item => unmarshall(item));

    } catch (error) {
        console.error('[ERROR] Erro ao buscar monitores:', error.message);
        return [];
    }
};

const saveMonitor = async (monitor) => {
    try {
        const command = new PutItemCommand({
            TableName: MONITORS_TABLE,
            Item: marshall({
                ...monitor,
                isActive: Boolean(monitor.isActive)
            }, {
                removeUndefinedValues: true
            })
        });

        await dynamoClient.send(command);
        console.log(`[DEBUG] Monitor ${monitor.alias} salvo com sucesso`);
        return true;

    } catch (error) {
        console.error('[ERROR] Erro ao salvar monitor:', error.message);
        return false;
    }
};

const updateMonitorResult = async (monitorId, httpResult, sslResult) => {
    try {
        // Processar sslResult
        const processedSSLResult = {
            ...sslResult,
            isValid: Boolean(sslResult.isValid === 'true'),
            alternativeNames: (() => {
                try {
                    const parsed = JSON.parse(sslResult.alternativeNames || '[]');
                    return Array.isArray(parsed) ? parsed : [];
                } catch {
                    return [];
                }
            })()
        };

        // Remover campos vazios
        Object.keys(processedSSLResult).forEach(key => {
            if (processedSSLResult[key] === '' || processedSSLResult[key] === null) {
                delete processedSSLResult[key];
            }
        });

        const updateData = {
            lastChecked: Date.now().toString(),
            currentStatus: httpResult.status,
            currentResponseTime: httpResult.responseTime,
            currentStatusCode: httpResult.statusCode,
            ssl: processedSSLResult
        };

        // Só adicionar error se existir
        if (httpResult.error && httpResult.error.trim() !== '') {
            updateData.currentError = httpResult.error;
        }

        const command = new UpdateItemCommand({
            TableName: MONITORS_TABLE,
            Key: marshall({ monitorId }),
            UpdateExpression: `SET ${Object.keys(updateData).map((key, index) => `#attr${index} = :val${index}`).join(', ')}`,
            ExpressionAttributeNames: Object.keys(updateData).reduce((acc, key, index) => {
                acc[`#attr${index}`] = key;
                return acc;
            }, {}),
            ExpressionAttributeValues: marshall(
                Object.keys(updateData).reduce((acc, key, index) => {
                    acc[`:val${index}`] = updateData[key];
                    return acc;
                }, {}),
                { removeUndefinedValues: true }
            )
        });

        await dynamoClient.send(command);
        return true;

    } catch (error) {
        console.error(`[ERROR] Erro ao salvar resultado para ${monitorId}:`, error.message);
        return false;
    }
};

module.exports = {
    getAllMonitors,
    saveMonitor,
    updateMonitorResult
};