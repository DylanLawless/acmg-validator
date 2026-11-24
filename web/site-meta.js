// Read display metadata from the same package manifest used by the CLI.
const footer = document.querySelector('[data-project-meta]');
if (footer) {
  try {
    const response = await fetch('/package.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { displayName, version } = await response.json();
    if (typeof displayName !== 'string' || !displayName.trim() ||
        typeof version !== 'string' || !/^\d+\.\d+\.\d+/.test(version)) {
      throw new Error('Invalid package metadata');
    }
    footer.textContent = `${displayName} v${version}. `;
  } catch {
    footer.textContent = 'Version information unavailable. ';
  }
}
