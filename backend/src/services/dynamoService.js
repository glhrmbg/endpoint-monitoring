const { DynamoDBClient, ScanCommand, PutItemCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const dynamoClient = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1'
});

const MONITORS_TABLE = process.env.MONITORS_TABLE || 'Monitors';

const getAllMonitors = async () => {
    try {
        console.log(`Scanning monitors from table: ${MONITORS_TABLE}`);

        const response = await dynamoClient.send(new ScanCommand({
            TableName: MONITORS_TABLE
        }));

        const monitors = (response.Items || []).map(item => unmarshall(item));
        console.log(`Retrieved ${monitors.length} monitors from database`);

        return monitors;
    } catch (error) {
        console.error('Failed to retrieve monitors from database:', error.message);
        throw new Error(`Database scan failed: ${error.message}`);
    }
};

const saveMonitor = async (monitor) => {
    try {
        console.log(`Saving monitor: ${monitor.monitorId} (${monitor.alias || monitor.url})`);

        await dynamoClient.send(new PutItemCommand({
            TableName: MONITORS_TABLE,
            Item: marshall(monitor, { removeUndefinedValues: true })
        }));

        console.log(`Successfully saved monitor: ${monitor.monitorId}`);
        return true;
    } catch (error) {
        console.error(`Failed to save monitor ${monitor.monitorId}:`, error.message);
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
        } else {
            // Remove error field if check succeeded
            updateData.currentError = null;
        }

        if (Object.keys(sslResult).length > 0) {
            updateData.ssl = sslResult;
        }

        console.log(`Updating monitor result: ${monitorId} - Status: ${httpResult.status}, Response Time: ${httpResult.responseTime}ms`);

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
            ),
            // Ensure the monitor exists before updating
            ConditionExpression: 'attribute_exists(monitorId)'
        }));

        console.log(`Successfully updated monitor result: ${monitorId}`);
        return true;
    } catch (error) {
        if (error.name === 'ConditionalCheckFailedException') {
            console.error(`Monitor ${monitorId} does not exist - cannot update result`);
            return false;
        }

        console.error(`Failed to update monitor result for ${monitorId}:`, error.message);
        return false;
    }
};

module.exports = {
    getAllMonitors,
    saveMonitor,
    updateMonitorResult
};