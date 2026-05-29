(function() {
    var AUTH_TOKEN = null;

    var match = location.search.match(/[?&]token=([^&]+)/);
    if (match) {
        AUTH_TOKEN = decodeURIComponent(match[1]);
    }

    window.addEventListener('message', function(e) {
        if (e.data && e.data.type === 'auth-token' && e.data.token) {
            AUTH_TOKEN = e.data.token;
        }
    });

    var originalFetch = window.fetch;
    window.fetch = function(url, options) {
        if (AUTH_TOKEN && typeof url === 'string' && url.startsWith('/api/')) {
            var separator = url.indexOf('?') > -1 ? '&' : '?';
            url = url + separator + 'token=' + encodeURIComponent(AUTH_TOKEN);
        }
        return originalFetch.call(window, url, options);
    };
})();
