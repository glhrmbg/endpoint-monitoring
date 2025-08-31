const { ScanCommand, PutItemCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { dynamoClient, MONITORS_TABLE } = require('../config/aws');
const { marshallItem, unmarshallItem } = require('../utils/helpers');
const logger = require('../utils/logger');

/**
 * Serviços do DynamoDB - AWS SDK v3
 */

const getAllMonitors = async () => {
    try {
        const command = new ScanCommand({
            TableName: MONITORS_TABLE
        });

        const response = await dynamoClient.send(command);
        const items = response.Items || [];

        return items.map(unmarshallItem);

    } catch (error) {
        logger.error('Erro ao buscar monitores:', error.message);
        return [];
    }
};

const saveMonitor = async (monitor) => {
    try {
        // Converter isActive para boolean no DynamoDB
        const itemToSave = { ...monitor };
        if (typeof itemToSave.isActive === 'string') {
            itemToSave.isActive = itemToSave.isActive === 'true';
        }

        const marshalled = {};
        for (const [key, value] of Object.entries(itemToSave)) {
            if (key === 'isActive') {
                marshalled[key] = { BOOL: Boolean(value) };
            } else {
                marshalled[key] = { S: value?.toString() || '' };
            }
        }

        const command = new PutItemCommand({
            TableName: MONITORS_TABLE,
            Item: marshalled
        });

        await dynamoClient.send(command);
        logger.debug(`Monitor ${monitor.alias} salvo com sucesso`);
        return true;

    } catch (error) {
        logger.error('Erro ao salvar monitor:', error.message);
        return false;
    }
};

const updateMonitorResult = async (monitorId, httpResult, sslResult) => {
    try {
        const currentTime = Date.now().toString();

        // Processar SSL result com tipos corretos
        const sslMarshalled = {};

        for (const [key, value] of Object.entries(sslResult)) {
            if (key === 'isValid') {
                // isValid como boolean
                sslMarshalled[key] = { BOOL: value === 'true' };
            } else if (key === 'alternativeNames') {
                // alternativeNames como array de strings
                try {
                    const altNames = JSON.parse(value);
                    if (Array.isArray(altNames) && altNames.length > 0) {
                        sslMarshalled[key] = {
                            L: altNames.map(name => ({ S: name }))
                        };
                    } else {
                        sslMarshalled[key] = { NULL: true };
                    }
                } catch {
                    sslMarshalled[key] = { NULL: true };
                }
            } else if (key === 'error') {
                // error como null se vazio, senão string
                if (value && value.trim() !== '') {
                    sslMarshalled[key] = { S: value };
                } else {
                    sslMarshalled[key] = { NULL: true };
                }
            } else {
                // outros campos como string (subject, issuer, etc.)
                if (value && value.trim() !== '') {
                    sslMarshalled[key] = { S: value };
                } else {
                    sslMarshalled[key] = { NULL: true };
                }
            }
        }

        const command = new UpdateItemCommand({
            TableName: MONITORS_TABLE,
            Key: {
                monitorId: { S: monitorId }
            },
            UpdateExpression: `
                SET lastChecked = :timestamp,
                    currentStatus = :status,
                    currentResponseTime = :response_time,
                    currentStatusCode = :status_code,
                    currentError = :error,
                    ssl = :ssl
            `,
            ExpressionAttributeValues: {
                ':timestamp': { S: currentTime },
                ':status': { S: httpResult.status },
                ':response_time': { S: httpResult.responseTime },
                ':status_code': { S: httpResult.statusCode },
                ':error': httpResult.error && httpResult.error.trim() !== ''
                    ? { S: httpResult.error }
                    : { NULL: true },
                ':ssl': { M: sslMarshalled }
            }
        });

        await dynamoClient.send(command);
        return true;

    } catch (error) {
        logger.error(`Erro ao salvar resultado para ${monitorId}:`, error.message);
        return false;
    }
};

module.exports = {
    getAllMonitors,
    saveMonitor,
    updateMonitorResult
};