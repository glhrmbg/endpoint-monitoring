const { DynamoDBClient, ScanCommand, PutItemCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const dynamoClient = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1'
});

const MONITORS_TABLE = process.env.MONITORS_TABLE || 'Monitors';

const getAllMonitors = async () => {
    try {
        const response = await dynamoClient.send(new ScanCommand({
            TableName: MONITORS_TABLE
        }));
        return (response.Items || []).map(item => unmarshall(item));
    } catch (error) {
        console.error('[ERROR] Erro ao buscar monitores:', error.message);
        return [];
    }
};

const saveMonitor = async (monitor) => {
    try {
        await dynamoClient.send(new PutItemCommand({
            TableName: MONITORS_TABLE,
            Item: marshall(monitor, { removeUndefinedValues: true })
        }));
        return true;
    } catch (error) {
        console.error('[ERROR] Erro ao salvar monitor:', error.message);
        return false;
    }
};

const updateMonitorResult = async (monitorId, httpResult, sslResult = {}) => {
    try {
        const updateData = {
            lastChecked: Date.now(),
            currentStatus: httpResult.status,
            currentResponseTime: httpResult.responseTime,
            currentStatusCode: httpResult.statusCode
        };

        if (httpResult.error) {
            updateData.currentError = httpResult.error;
        }

        if (Object.keys(sslResult).length > 0) {
            updateData.ssl = sslResult;
        }

        await dynamoClient.send(new UpdateItemCommand({
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
        }));
        return true;
    } catch (error) {
        console.error(`[ERROR] Erro ao salvar resultado:`, error.message);
        return false;
    }
};

module.exports = {
    getAllMonitors,
    saveMonitor,
    updateMonitorResult
};