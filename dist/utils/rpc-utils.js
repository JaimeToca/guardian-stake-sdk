"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildUrl = buildUrl;
exports.perform = perform;
function buildUrl(base, path, query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        params.set(key, value.toString());
    }
    return `${base}${path}?${params}`;
}
async function perform(request) {
    try {
        const res = await fetch(request);
        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`Network request failed: ${res.status}: ${res.statusText} - ${errorText}`);
        }
        const data = (await res.json());
        return data;
    }
    catch (err) {
        console.error(`Failed with error:`, err);
        throw err;
    }
}
//# sourceMappingURL=rpc-utils.js.map