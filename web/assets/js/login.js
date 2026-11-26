const loginForm = document.querySelector('#login-form');
const loginMessage = document.querySelector('#login-message');

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginMessage.className = 'form-message';
  loginMessage.textContent = 'Signing in…';

  const formData = new FormData(loginForm);
  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: formData.get('username'),
        password: formData.get('password'),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || 'Could not sign in.');
    window.location.assign('/dashboard');
  } catch (error) {
    loginMessage.textContent = error.message || 'Could not reach PresenDex.';
    loginMessage.className = 'form-message error';
  }
});
