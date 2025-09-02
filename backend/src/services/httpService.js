const checkHttp = async (url, timeout = 30) => {
    const result = {
        status: 'UNKNOWN',
        responseTime: 0,
        statusCode: 0,
        error: ''
    };

    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout * 1000);

    try {
        const response = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
            redirect: 'follow'
        });

        clearTimeout(timeoutId);

        result.responseTime = Date.now() - startTime;
        result.statusCode = response.status;
        result.status = response.status === 200 ? 'UP' : 'DOWN';

        if (response.status !== 200) {
            result.error = `HTTP ${response.status}`;
        }

    } catch (error) {
        clearTimeout(timeoutId);

        result.responseTime = Date.now() - startTime;
        result.status = 'DOWN';

        if (error.name === 'AbortError') {
            result.error = `Timeout ${timeout}s`;
        } else if (error.message.includes('certificate')) {
            result.error = 'Erro SSL';
        } else {
            result.error = error.message;
        }
    }

    return result;
};

module.exports = { checkHttp };