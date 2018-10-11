const apiKey = 'AIzaSyBGZZYZt35qN2RKwVsH0mYnTUtrnpTvoso';
const clientId = '179651401415-qieevlbeijdjtlrn1s1md1g1nio63ct5.apps.googleusercontent.com';
const scope = 'https://www.googleapis.com/auth/drive.readonly';

var pickerApiLoaded = false;
var oauthToken;

function onApiLoad() {
  gapi.load('auth2', onAuthApiLoad);
  gapi.load('picker', onPickerApiLoad);
}

function onAuthApiLoad() {
  const authBtn = document.getElementById('google-auth');
  authBtn.disabled = false;
  authBtn.addEventListener('click', function() {
    if (oauthToken) {
      createPicker();
    } else {
      gapi.auth2.authorize({
        client_id: clientId,
        scope: scope
      }, handleAuthResult);
    }
  });
}

function onPickerApiLoad() {
  pickerApiLoaded = true;
  createPicker();
}

function handleAuthResult(authResult) {
  if (authResult && !authResult.error) {
    oauthToken = authResult.access_token;
    createPicker();
  }
}

function createPicker() {
  if (pickerApiLoaded && oauthToken) {
    const picker = new google.picker.PickerBuilder().
      addView(google.picker.ViewId.DOCS).
      setOAuthToken(oauthToken).
      setDeveloperKey(apiKey).
      setCallback(pickerCallback).
      build();
    picker.setVisible(true);
  }
}

function pickerCallback(data) {
  var url = 'nothing';
  if (data[google.picker.Response.ACTION] == google.picker.Action.PICKED) {
    const doc = data[google.picker.Response.DOCUMENTS][0];
    url = doc[google.picker.Document.URL];
    const element = document.createElement('p');
    element.appendChild(document.createTextNode(url));
    document.getElementById('result').appendChild(element);
  }
}
