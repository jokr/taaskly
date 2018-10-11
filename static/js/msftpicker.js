var accessToken = msftToken;
var onedriveEndpoint;
var sharepointEndpoint;

const authBtn = document.getElementById('msft-auth');
authBtn.addEventListener('click', oauth);

const onedrivePickerBtn = document.getElementById('msft-picker-onedrive');
onedrivePickerBtn.addEventListener('click', onedrivePicker);

const sharepointPickerBtn = document.getElementById('msft-picker-sharepoint');
sharepointPickerBtn.addEventListener('click', sharepointPicker);

function oauth() {
  const params = new URLSearchParams();
  params.set('client_id', '0da76f16-2386-4b51-bd46-c8c8ccd79d37');
  params.set('redirect_uri', 'https://www.taaskly.com/oauth/msft');
  params.set('response_type', 'code');
  params.set('response_mode', 'query');
  params.set('scope', 'files.read.all');
  window.msftCallback = (token) => {
    accessToken = token;
    fetchEndpoints();
  }
  window.open(
    'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize?' + params.toString(),
    'msft-oauth',
    'height=800,width=800'
  );
}

function fetchEndpoints() {
  Promise.all([
    msftRequest('me/drive'),
    msftRequest('drive'),
  ])
    .then(response => {
      onedriveEndpoint = response[0].webUrl;
      sharepointEndpoint = response[1].webUrl;
      authBtn.disabled = true;
      onedrivePickerBtn.disabled = false;
      sharepointPickerBtn.disabled = false;
    });
}

if (accessToken) {
  fetchEndpoints();
}

function onedrivePicker() {
  picker(onedriveEndpoint)
}

function sharepointPicker() {
  picker(sharepointEndpoint)
}

function picker(endpoint) {
  OneDrive.open({
    clientId: '0da76f16-2386-4b51-bd46-c8c8ccd79d37',
    action: 'query',
    advanced: {
      accessToken: accessToken,
      endpointHint: endpoint,
    },
    multiSelect: false,
    success: onSuccess,
    error: onError
  });
}

function msftRequest(path) {
  return new Promise(function (resolve, reject) {
    const request = new XMLHttpRequest();
    request.onreadystatechange = function () {
      if (this.readyState === 4 && this.status === 200) {
        const response = JSON.parse(this.responseText);
        resolve(response);
      } else if (this.readyState === 4) {
        reject(this.responseText);
      }
    }
    request.open('GET', `https://graph.microsoft.com/v1.0/${path}`);
    request.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    request.send();
  });
}

function onSuccess(pickerResponse) {
  console.log(pickerResponse);
  const id = pickerResponse.value[0].id;
  const parentId = pickerResponse.value[0].parentReference.driveId;
  msftRequest(`drives/${parentId}/items/${id}`)
    .then(response => {
      const element = document.createElement('p');
      element.appendChild(document.createTextNode(response.webUrl));
      document.getElementById('result').appendChild(element);
    });
}

function onError(error) {
  console.log(error);
}
