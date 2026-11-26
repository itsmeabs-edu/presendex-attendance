const setupForm = document.querySelector('#setup-form');
const setupMessage = document.querySelector('#setup-message');

async function checkSetupAvailability() {
  try {
    const response = await fetch('/api/setup/status');
    const result = await response.json();
    if (!result.setup_required) {
      setupForm.hidden = true;
      setupMessage.textContent = 'The admin account has already been created. Please sign in.';
      document.querySelector('.auth-footnote').hidden = false;
    }
  } catch {
    setupMessage.textContent = 'Could not check setup status. Make sure the PresenDex service is running.';
    setupMessage.className = 'form-message error';
  }
}

setupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(setupForm);
  const password = formData.get('password');
  const confirmPassword = formData.get('confirm_password');
  if (password !== confirmPassword) {
    setupMessage.textContent = 'The passwords do not match.';
    setupMessage.className = 'form-message error';
    return;
  }

  setupMessage.textContent = 'Creating the admin account…';
  setupMessage.className = 'form-message';
  try {
    const response = await fetch('/api/setup/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: formData.get('full_name'),
        username: formData.get('username'),
        password,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || 'Could not create the admin account.');
    window.location.assign('/dashboard');
  } catch (error) {
    setupMessage.textContent = error.message || 'Could not reach PresenDex.';
    setupMessage.className = 'form-message error';
  }
});

checkSetupAvailability();
