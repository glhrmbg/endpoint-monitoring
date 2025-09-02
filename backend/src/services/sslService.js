const tls = require('tls');

const checkSSL = async (url) => {
    return new Promise((resolve) => {
        const result = {
            isValid: false,
            subject: '',
            issuer: '',
            serialNumber: '',
            version: 0,
            expiresAt: 0,
            daysUntilExpiry: 0,
            alternativeNames: [],
            tlsVersion: '',
            cipherSuite: '',
            error: ''
        };

        try {
            const { hostname, port } = new URL(url);
            const targetPort = port || 443;

            const socket = tls.connect({
                host: hostname,
                port: targetPort,
                servername: hostname,
                rejectUnauthorized: false,
                timeout: 10000
            });

            socket.on('secureConnect', () => {
                try {
                    const cert = socket.getPeerCertificate(true);

                    if (!cert || Object.keys(cert).length === 0) {
                        result.error = 'No certificate';
                        return resolve(result);
                    }

                    result.subject = cert.subject?.CN || '';
                    result.issuer = cert.issuer?.CN || '';
                    result.serialNumber = cert.serialNumber || '';
                    result.version = cert.version || '';

                    if (cert.valid_to) {
                        result.expiresAt = new Date(cert.valid_to).getTime();
                        result.daysUntilExpiry = Math.ceil((result.expiresAt - Date.now()) / (1000 * 60 * 60 * 24));
                    }

                    if (cert.subjectaltname) {
                        result.alternativeNames = cert.subjectaltname
                            .replace(/DNS:/g, '')
                            .split(', ')
                            .map(name => name.trim());
                    }

                    result.tlsVersion = socket.getProtocol() || '';
                    const cipher = socket.getCipher();
                    result.cipherSuite = cipher?.name || '';

                    result.isValid = socket.authorized;
                    if (!socket.authorized) {
                        result.error = socket.authorizationError || 'Invalid cert';
                    }

                } catch (err) {
                    result.error = err.message;
                } finally {
                    socket.end();
                    resolve(result);
                }
            });

            socket.on('error', (error) => {
                result.error = error.message;
                resolve(result);
            });

            socket.on('timeout', () => {
                result.error = 'Timeout';
                socket.destroy();
                resolve(result);
            });

        } catch (error) {
            result.error = error.message;
            resolve(result);
        }
    });
};

module.exports = { checkSSL };