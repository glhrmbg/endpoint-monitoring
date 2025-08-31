const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');

/**
 * Configurações AWS - SDK v3
 */

const dynamoClient = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1'
});

const MONITORS_TABLE = process.env.MONITORS_TABLE || 'Monitors';

module.exports = {
    dynamoClient,
    MONITORS_TABLE
};