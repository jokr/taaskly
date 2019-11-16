window.addEventListener('message', (event) => {
  if (event.origin !== window.origin) {
    return;
  }
  if (event.data !== 'login') {
    return;
  }
  window.location.href = '/';
  event.source.close();
}, false);
