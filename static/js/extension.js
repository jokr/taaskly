window.isExtensionLoaded = false;
window.appID = getParameterByName('appID');

function getParameterByName(name) {
    name = name.replace(/[\[\]]/g, '\\$&');
    var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
        results = regex.exec(window.location.href);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, ' '));
}

function insertInDiv(divId, key, value) {
  var div = document.getElementById(divId);
  div.insertAdjacentHTML('afterend', '<p>' + key + ': ' + value + '</p>');
};

function insertErrorInDiv(divId, key, value) {
  var div = document.getElementById(divId);
  div.insertAdjacentHTML('afterend', '<font color="red">' + key + ': ' + value + '</font>');
};

function insertJsonObj(divId, jsonObj) {
  var parent = document.getElementById(divId);
  var div = document.createElement('code');
  div.setAttribute('style', 'white-space: pre-wrap; word-break: break-all');
  parent.appendChild(div);
  div.appendChild(document.createTextNode(JSON.stringify(jsonObj, null, 4)));
};

window.extAsyncInit = function() {
  // the Messenger Extensions JS SDK is done loading
  insertInDiv('div_status', 'extension loading status', 'loaded');
  window.isExtensionLoaded = true;
  getSupportedFeatures();
  getContext(window.appID);
  getGrantedPermissions();
};

function onExitClicked() {
  if (window.isExtensionLoaded === false) {
    alert('Extension has not been loaded');
    return;
  }
  MessengerExtensions.requestCloseBrowser(function success() {
    // webview closed
  }, function error(err) {
    // an error occurred
    console.log(err);
  });
};

function onGetPermClicked(permName, resultDivID) {
  if (window.isExtensionLoaded === false) {
    alert('Extension has not been loaded');
    return;
  }
  MessengerExtensions.askPermission(function success(resp) {
    insertJsonObj(resultDivID, resp);
  }, function error(code, msg) {
    insertErrorInDiv(resultDivID, 'askPermission failed: ', JSON.stringify({
      'code': code,
      'msg': msg
    }));
  }, permName);
};

function onShareClicked(text, mode, resultDivID) {
  let message = {
    "attachment":{
      "type":"template",
      "payload":{
        "template_type":"generic",
        "elements": [{
          "title": text,
          "image_url": "https://scott-pusheen.herokuapp.com/taaskly.png",
          "subtitle": "Awesome attachment",
          "buttons":[{
            "type": "web_url",
            "url": window.location.href,
            "title": "Check this out!",
            "messenger_extensions": true,
            "webview_height_ratio": "tall"
          }]
        }]
      }
    }
  };
  MessengerExtensions.beginShareFlow(function success(response) {
    MessengerExtensions.requestCloseBrowser();
  }, function error(code, msg) {
    insertErrorInDiv(resultDivID, 'beginShareFlow failed: ', JSON.stringify({
      'code': code,
      'msg': msg
    }));
  }, message, mode);
};

function getSupportedFeatures() {
  MessengerExtensions.getSupportedFeatures(function success(result) {
    insertJsonObj('div_features', result);
    // for (var i = 0; i < result['supported_features'].length; i++) {
    //   insertInDiv('div_features', i+1, result['supported_features'][i]);
    // }
  }, function error(err) {
    insertErrorInDiv('div_features', 'getSupportedFeatures failed: ', err);
  });
};

function getGrantedPermissions() {
  MessengerExtensions.getGrantedPermissions(function success(result) {
    insertJsonObj('div_permissions', result);
    // for (var i = 0; i < result['permissions'].length; i++) {
    //   insertInDiv('div_permissions', i+1, result['permissions'][i]);
    // }
  }, function error(err) {
    insertErrorInDiv('div_features', 'getGrantedPermissions failed: ', err);
  });
};

function getContext(app_id) {
  MessengerExtensions.getContext(app_id,
    function success(thread_context){
      insertJsonObj('div_context', thread_context);
    },
    function error(err){
        insertErrorInDiv('div_context', 'getContext failed: ', err);
    }
  );
};

(function(d, s, id){
   var js, fjs = d.getElementsByTagName(s)[0];
   if (d.getElementById(id)) {return;}
   js = d.createElement(s); js.id = id;
   js.src = "//connect.facebook.net/en_US/sdk.js";
   fjs.parentNode.insertBefore(js, fjs);
 }(document, 'script', 'facebook-jssdk'));

(function(d, s, id){
  var js, fjs = d.getElementsByTagName(s)[0];
  if (d.getElementById(id)) {return;}
  js = d.createElement(s); js.id = id;
  js.src = "//connect.facebook.com/en_US/messenger.Extensions.js";
  fjs.parentNode.insertBefore(js, fjs);
}(document, 'script', 'Messenger'));
