async function showSetupLinkWhenNeeded() {
  const setupLink = document.querySelector('#setup-link');

  try {
    const response = await fetch('/api/setup/status');
    const setup = await response.json();
    setupLink.hidden = !setup.setup_required;
  } catch {
    setupLink.hidden = true;
  }
}

showSetupLinkWhenNeeded();
