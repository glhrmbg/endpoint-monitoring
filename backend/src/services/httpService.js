const checkHttp = async (url, timeout = 30, retries = 0) => {
    const result = {
        status: 'UNKNOWN',
        responseTime: 0,
        statusCode: 0,
        error: '',
        retryCount: retries
    };

    // Validate inputs
    if (!url || typeof url !== 'string') {
        result.error = 'Invalid URL provided';
        result.status = 'DOWN';
        return result;
    }

    if (timeout < 1 || timeout > 300) {
        console.warn(`Invalid timeout ${timeout}, using default 30s`);
        timeout = 30;
    }

    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        console.warn(`HTTP request timeout for ${url} after ${timeout}s`);
        controller.abort();
    }, timeout * 1000);

    try {
        console.log(`Initiating HTTP request to: ${url} (timeout: ${timeout}s, attempt: ${retries + 1})`);

        const response = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
            redirect: 'follow',
            headers: {
                'Accept': '*/*',
                'Cache-Control': 'no-cache',
                'Connection': 'close'
            }
        });

        clearTimeout(timeoutId);

        result.responseTime = Date.now() - startTime;
        result.statusCode = response.status;

        // More comprehensive status checking
        if (response.status >= 200 && response.status < 300) {
            result.status = 'UP';
            console.log(`HTTP request successful for ${url}: ${response.status} (${result.responseTime}ms)`);
        } else if (response.status >= 300 && response.status < 400) {
            // Redirects are generally OK for monitoring purposes
            result.status = 'UP';
            console.log(`HTTP request with redirect for ${url}: ${response.status} (${result.responseTime}ms)`);
        } else if (response.status >= 400 && response.status < 500) {
            result.status = 'DOWN';
            console.warn(`HTTP client error for ${url}: ${response.status} ${response.statusText} (${result.responseTime}ms)`);
            result.error = `HTTP ${response.status} ${response.statusText}`;
        } else {
            result.status = 'DOWN';
            console.warn(`HTTP server error for ${url}: ${response.status} ${response.statusText} (${result.responseTime}ms)`);
            result.error = `HTTP ${response.status} ${response.statusText}`;
        }

    } catch (error) {
        clearTimeout(timeoutId);

        result.responseTime = Date.now() - startTime;
        result.status = 'DOWN';

        // Enhanced error categorization
        if (error.name === 'AbortError') {
            console.error(`HTTP request timed out for ${url} after ${timeout}s`);
            result.error = `Request timeout after ${timeout}s`;
        } else if (error.message.includes('certificate') || error.message.includes('SSL') || error.message.includes('TLS')) {
            console.error(`SSL/TLS error for ${url}: ${error.message}`);
            result.error = 'SSL/TLS certificate error';
        } else if (error.code === 'ENOTFOUND' || error.message.includes('getaddrinfo')) {
            console.error(`DNS resolution failed for ${url}: ${error.message}`);
            result.error = 'DNS resolution failed';
        } else if (error.code === 'ECONNREFUSED') {
            console.error(`Connection refused for ${url}: ${error.message}`);
            result.error = 'Connection refused';
        } else if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
            console.error(`Connection timed out for ${url}: ${error.message}`);
            result.error = 'Connection timeout';
        } else if (error.code === 'ECONNRESET') {
            console.error(`Connection reset for ${url}: ${error.message}`);
            result.error = 'Connection reset by peer';
        } else if (error.code === 'EHOSTUNREACH') {
            console.error(`Host unreachable for ${url}: ${error.message}`);
            result.error = 'Host unreachable';
        } else if (error.code === 'ENETWORK' || error.code === 'ENETUNREACH') {
            console.error(`Network error for ${url}: ${error.message}`);
            result.error = 'Network unreachable';
        } else if (error.message.includes('fetch')) {
            console.error(`Fetch API error for ${url}: ${error.message}`);
            result.error = `Fetch error: ${error.message}`;
        } else {
            console.error(`HTTP request failed for ${url}: ${error.message}`);
            result.error = error.message || 'Unknown network error';
        }

        // Implement simple retry logic for certain errors
        const retryableErrors = ['ECONNRESET', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ENETWORK'];
        const isRetryable = retryableErrors.some(code =>
            error.code === code || error.message.includes(code.toLowerCase())
        );

        if (isRetryable && retries < 2 && result.responseTime < (timeout * 1000 * 0.8)) {
            console.warn(`Retrying request for ${url} due to ${error.code || error.name}`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
            return checkHttp(url, timeout, retries + 1);
        }
    }

    return result;
};

module.exports = { checkHttp };