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

            console.log(`Starting SSL certificate check for ${hostname}:${targetPort}`);

            const socket = tls.connect({
                host: hostname,
                port: targetPort,
                servername: hostname,
                rejectUnauthorized: false,
                timeout: 10000
            });

            socket.on('secureConnect', () => {
                try {
                    console.log(`SSL connection established for ${hostname}:${targetPort}`);

                    const cert = socket.getPeerCertificate(true);

                    if (!cert || Object.keys(cert).length === 0) {
                        console.error(`No SSL certificate found for ${hostname}:${targetPort}`);
                        result.error = 'No certificate found';
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

                    if (socket.authorized) {
                        console.log(`SSL certificate is valid for ${hostname}:${targetPort} - Subject: ${result.subject}, Expires: ${result.daysUntilExpiry} days`);
                    } else {
                        const authError = socket.authorizationError || 'Certificate validation failed';
                        console.warn(`SSL certificate validation failed for ${hostname}:${targetPort}: ${authError}`);
                        result.error = authError;
                    }

                    // Warning for certificates expiring soon
                    if (result.daysUntilExpiry <= 30 && result.daysUntilExpiry > 0) {
                        console.warn(`SSL certificate for ${hostname}:${targetPort} expires soon: ${result.daysUntilExpiry} days remaining`);
                    } else if (result.daysUntilExpiry <= 0) {
                        console.error(`SSL certificate for ${hostname}:${targetPort} has expired: ${Math.abs(result.daysUntilExpiry)} days ago`);
                    }

                } catch (error) {
                    console.error(`Error processing SSL certificate for ${hostname}:${targetPort}: ${error.message}`);
                    result.error = error.message;
                } finally {
                    socket.end();
                    resolve(result);
                }
            });

            socket.on('error', (error) => {
                console.error(`SSL connection error for ${hostname}:${targetPort}: ${error.message}`);
                result.error = error.message;
                resolve(result);
            });

            socket.on('timeout', () => {
                console.error(`SSL connection timeout for ${hostname}:${targetPort}`);
                result.error = 'Connection timeout';
                socket.destroy();
                resolve(result);
            });

        } catch (error) {
            console.error(`SSL check initialization failed for ${url}: ${error.message}`);
            result.error = error.message;
            resolve(result);
        }
    });
};

module.exports = { checkSSL };