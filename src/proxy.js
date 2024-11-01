const m3u8ContentTypes = ['application/vnd.apple.mpegurl', 'application/x-mpegurl', 'audio/x-mpegurl', 'audio/mpegurl', 'video/x-mpegurl'];

// Function to decode base64 headers and transform into a Headers object
function decodeHeaders(base64Headers) {
	try {
		const decodedString = atob(decodeURIComponent(base64Headers));
		const headersObj = JSON.parse(decodedString);
		const headers = new Headers();
		for (const key in headersObj) {
			if (headersObj.hasOwnProperty(key)) {
				headers.append(key, headersObj[key]);
			}
		}
		return headers;
	} catch (error) {
		return null;
	}
}

async function proxy(request) {
	const urlParams = new URL(request.url).searchParams;
	const encodedUrl = urlParams.get('url');
	const headersBase64 = urlParams.get('headers');

	if (!encodedUrl || !headersBase64) {
		return new Response('Both "url" and "headers" query parameters are required', { status: 400 });
	}

	// Decode the URL from base64
	const m3u8Url = atob(decodeURIComponent(encodedUrl));

	// Decode and transform the headers
	const decodedHeaders = decodeHeaders(headersBase64);
	if (!decodedHeaders) {
		return new Response('Invalid headers format. Must be valid base64-encoded JSON.', { status: 400 });
	}

	const baseUrl = new URL(m3u8Url);
	const basePath = `${baseUrl.protocol}//${baseUrl.host}${baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1)}`;

	console.log(decodeHeaders);

	try {
		// Fetch the M3U8 file
		const response = await fetch(m3u8Url, {
			method: 'GET',
			headers: decodedHeaders,
		});

		const contentType = response.headers.get('content-type') || 'application/octet-stream';
		const isM3U8 = m3u8ContentTypes.some((type) => contentType.includes(type));

		if (isM3U8) {
			let responseData = '';
			const reader = response.body.getReader();
			const decoder = new TextDecoder('utf-8');

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				responseData += decoder.decode(value, { stream: true });
			}

			const modifiedBody = responseData.replace(/^(?!#)([^\s]+)$/gm, (match) => {
				let fullUrl;
				if (match.startsWith('http://') || match.startsWith('https://')) {
					fullUrl = match;
				} else if (match.startsWith('/')) {
					fullUrl = `${baseUrl.protocol}//${baseUrl.host}${match}`;
				} else {
					fullUrl = `${basePath}${match}`;
				}

				const proxiedLink = `${new URL(request.url).origin}/proxy?url=${encodeURIComponent(btoa(fullUrl))}&headers=${encodeURIComponent(
					headersBase64
				)}`;

				return proxiedLink;
			});

			return new Response(modifiedBody, {
				headers: {
					'Content-Type': 'application/vnd.apple.mpegurl',
					'Access-Control-Allow-Origin': '*',
				},
			});
		} else {
			return new Response(response.body, {
				headers: {
					'Content-Type': contentType,
					'Access-Control-Allow-Origin': '*',
				},
			});
		}
	} catch (error) {
		console.error('Error fetching the M3U8 file:', error.message);
		return new Response('Error fetching the M3U8 file: ' + error.message, {
			status: 500,
		});
	}
}

export default proxy;
