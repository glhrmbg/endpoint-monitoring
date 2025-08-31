const checkHttp = async (url, timeout = 30) => {
    const result = {
        status: 'UNKNOWN',
        responseTime: '0',
        statusCode: '0',
        error: ''
    };

    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout * 1000);

    try {
        console.log(`[DEBUG] Verificando HTTP: ${url}`);

        const response = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
            redirect: 'follow'
        });

        clearTimeout(timeoutId);

        const responseTime = Date.now() - startTime;
        result.responseTime = responseTime.toString();
        result.statusCode = response.status.toString();

        if (response.status === 200) {
            result.status = 'UP';
            console.log(`[DEBUG] HTTP OK: ${url} (${responseTime}ms)`);
        } else {
            result.status = 'DOWN';
            result.error = `HTTP ${response.status}`;
            console.warn(`[WARN] HTTP ${response.status}: ${url}`);
        }

    } catch (error) {
        clearTimeout(timeoutId);

        const responseTime = Date.now() - startTime;
        result.responseTime = responseTime.toString();
        result.status = 'DOWN';

        if (error.name === 'AbortError') {
            result.error = `Timeout após ${timeout}s`;
            result.responseTime = (timeout * 1000).toString();
            console.warn(`[WARN] Timeout: ${url} após ${timeout}s`);
        } else if (error.message.includes('certificate') || error.message.includes('SSL')) {
            result.error = `Erro SSL: ${error.message}`;
            console.warn(`[WARN] SSL Error: ${url}`);
        } else if (error.code === 'ECONNREFUSED' ||
            error.code === 'ENOTFOUND' ||
            error.message.includes('ECONNREFUSED') ||
            error.message.includes('ENOTFOUND')) {
            result.error = `Erro de conexão: ${error.message}`;
            console.warn(`[WARN] Connection Error: ${url}`);
        } else {
            result.error = error.message;
            console.warn(`[WARN] General Error: ${url} - ${error.message}`);
        }
    }

    return result;
};

module.exports = {
    checkHttp
};