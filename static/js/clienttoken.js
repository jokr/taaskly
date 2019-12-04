
const data = window.location.hash
  .substring(1)
  .split('&')
  .map(pair => pair.split('='));
const dataMap = new Map(data);
const dataElement = document.getElementById('data');
dataElement.innerHTML = JSON.stringify(data, undefined, 2);

if (dataMap.has('access_token')) {
  const formData = new FormData();
  const opener = window.opener;
  formData.append('token', dataMap.get('access_token'));
  fetch('/login_with_access_token', {
    method: 'POST',
    body: new URLSearchParams(formData),
  })
  .then(() => {
    opener.postMessage('login', '*');
  });
} else if (dataMap.has('id_token')) {
  const formData = new FormData();
  const opener = window.opener;
  formData.append('token', dataMap.get('id_token'));
  fetch('/login_with_id_token', {
    method: 'POST',
    body: new URLSearchParams(formData),
  })
  .then(() => {
    opener.postMessage('login', '*');
  });
}
