/**
 * Load a versioned rule catalogue in Node.js or a modern browser.
 * A local Node CLI reads packaged JSON; the browser fetches the same JSON
 * from the local server. This avoids browser-specific JSON import attributes.
 */
export async function loadJSON(relativePath, baseURL) {
  const url = new URL(relativePath, baseURL);
  if (url.protocol === 'file:') {
    const { readFile } = await import('node:fs/promises');
    return JSON.parse(await readFile(url, 'utf8'));
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Cannot load rule catalogue: ${url.pathname} (${response.status})`);
  return response.json();
}
