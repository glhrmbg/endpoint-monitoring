const tls = require('tls');
const { calculateDaysUntilExpiry } = require('../utils/helpers');

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
            const targetPort = port || 443;

            console.log(`[DEBUG] Verificando SSL: ${hostname}:${targetPort}`);

            const socket = tls.connect({
                host: hostname,
                port: targetPort,
                servername: hostname,
                rejectUnauthorized: false,
                timeout: 10000,
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

                    const authorized = socket.authorized;
                    const authError = socket.authorizationError;

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
                        console.warn(`[WARN] Erro ao obter cipher info: ${cipherError.message}`);
                    }

                    if (authorized) {
                        result.isValid = 'true';
                        console.log(`[DEBUG] SSL válido: ${hostname} - ${result.subject}`);
                    } else {
                        result.isValid = 'false';
                        result.error = authError || 'Certificate validation failed';
                        console.warn(`[WARN] SSL inválido: ${hostname} - ${result.error}`);
                    }

                } catch (certError) {
                    result.error = certError.message;
                    console.warn(`[WARN] Erro ao processar certificado: ${certError.message}`);
                } finally {
                    socket.end();
                }

                resolve(result);
            });

            socket.on('error', (error) => {
                result.error = error.message;
                console.warn(`[WARN] SSL Error para ${hostname}: ${error.message}`);
                resolve(result);
            });

            socket.on('timeout', () => {
                result.error = 'SSL connection timeout';
                console.warn(`[WARN] SSL Timeout para ${hostname}`);
                socket.destroy();
                resolve(result);
            });

        } catch (error) {
            result.error = error.message;
            console.warn(`[WARN] SSL Check Error: ${error.message}`);
            resolve(result);
        }
    });
};

module.exports = {
    checkSSL
};