const tls = require('tls');
const { DEFAULTS } = require('../utils/constants');
const { calculateDaysUntilExpiry } = require('../utils/helpers');
const logger = require('../utils/logger');

/**
 * Serviços de verificação SSL - CommonJS
 */

const checkSSL = async (url) => {
    return new Promise((resolve) => {
        const result = {
            isValid: 'false',
            subject: '',
            issuer: '',
            serialNumber: '',
            version: '',
            expiresAt: '',
            daysUntilExpiry: '',
            alternativeNames: '',
            tlsVersion: '',
            cipherSuite: '',
            error: ''
        };

        try {
            const { hostname, port } = new URL(url);
            const targetPort = port || DEFAULTS.SSL_PORT;

            logger.debug(`Verificando SSL: ${hostname}:${targetPort}`);

            const socket = tls.connect({
                host: hostname,
                port: targetPort,
                servername: hostname, // SNI explícito
                rejectUnauthorized: false,
                timeout: DEFAULTS.TLS_TIMEOUT,
                // Forçar TLS moderno como o Python provavelmente usa
                secureProtocol: 'TLS_method',
                ciphers: 'HIGH:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA'
            });

            socket.on('secureConnect', () => {
                try {
                    const cert = socket.getPeerCertificate(true);

                    if (!cert || Object.keys(cert).length === 0) {
                        result.error = 'No certificate found';
                        return resolve(result);
                    }

                    // Verificar se o certificado é válido para o hostname
                    const authorized = socket.authorized;
                    const authError = socket.authorizationError;

                    // Preencher dados do certificado mesmo se hostname não confere
                    result.subject = cert.subject?.CN || '';
                    result.issuer = cert.issuer?.CN || '';
                    result.serialNumber = cert.serialNumber || '';
                    result.version = cert.version?.toString() || '';

                    if (cert.valid_to) {
                        const expiresAt = new Date(cert.valid_to).getTime();
                        result.expiresAt = expiresAt.toString();
                        result.daysUntilExpiry = calculateDaysUntilExpiry(cert.valid_to);
                    }

                    const altNames = cert.subjectaltname
                        ? cert.subjectaltname.replace(/DNS:/g, '').split(', ').map(n => n.trim())
                        : [];
                    result.alternativeNames = JSON.stringify(altNames);

                    try {
                        result.tlsVersion = socket.getProtocol() || '';
                        const cipher = socket.getCipher();
                        result.cipherSuite = cipher?.name || '';
                    } catch (cipherError) {
                        logger.warn('Erro ao obter cipher info:', cipherError.message);
                    }

                    // Determinar se é válido
                    if (authorized) {
                        result.isValid = 'true';
                        logger.debug(`SSL válido: ${hostname} - ${result.subject}`);
                    } else {
                        result.isValid = 'false';
                        result.error = authError || 'Certificate validation failed';
                        logger.warn(`SSL inválido: ${hostname} - ${result.error}`);
                    }

                } catch (certError) {
                    result.error = certError.message;
                    logger.warn(`Erro ao processar certificado: ${certError.message}`);
                } finally {
                    socket.end();
                }

                resolve(result);
            });

            socket.on('error', (error) => {
                result.error = error.message;
                logger.warn(`SSL Error para ${hostname}: ${error.message}`);
                resolve(result);
            });

            socket.on('timeout', () => {
                result.error = 'SSL connection timeout';
                logger.warn(`SSL Timeout para ${hostname}`);
                socket.destroy();
                resolve(result);
            });

        } catch (error) {
            result.error = error.message;
            logger.warn(`SSL Check Error: ${error.message}`);
            resolve(result);
        }
    });
};

const isSSLValid = async (url) => {
    try {
        const result = await checkSSL(url);
        return result.isValid === 'true';
    } catch {
        return false;
    }
};

module.exports = {
    checkSSL,
    isSSLValid
};