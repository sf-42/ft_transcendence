/**
 * Escapes HTML special characters to prevent XSS attacks
 * Use this for any user-provided content before inserting into HTML
 */
export function escapeHtml(unsafe: string | undefined | null): string {
	if (unsafe == null) return '';
	return String(unsafe)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

/**
 * Validates and sanitizes a URL to prevent XSS via javascript: URLs
 * Returns empty string if URL is invalid or potentially dangerous
 */
export function sanitizeUrl(url: string | undefined | null): string {
	if (url == null) return '';
	const sanitized = String(url).trim();
	// Only allow http(s), data (for images), and relative URLs
	if (sanitized.startsWith('http://') || 
		sanitized.startsWith('https://') || 
		sanitized.startsWith('data:image/') ||
		sanitized.startsWith('/') ||
		sanitized.startsWith('./') ||
		sanitized.startsWith('../')) {
		return sanitized;
	}
	// Block javascript:, data: (non-image), vbscript:, etc.
	return '';
}

export function html<T extends HTMLElement = HTMLDivElement>(
	strings: TemplateStringsArray,
	...values: unknown[]
  ): T {
	const template = document.createElement('template');
  
	values = values.map((value: unknown) => {
	  if (value instanceof HTMLElement) return value.outerHTML;
	  else return value;
	});
  
	template.innerHTML = String.raw(strings, ...values).trim();
	return template.content.firstElementChild as T;
}
