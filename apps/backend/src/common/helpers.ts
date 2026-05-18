export function generateGraphUrl(baseUrl, params) {
    const url = new URL(baseUrl);

    // URLSearchParams handles the encoding of the JSON string automatically
    Object.keys(params).forEach(key => {
        url.searchParams.append(key, params[key]);
    });

    return url.toString();
}
