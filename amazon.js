/*
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *
 *     http://aws.amazon.com/apache2.0/
 *
 * or in the "license" file accompanying this file. This file is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */
var afb;
var alexaWs;

var base = {
  base: "api",
  token: "HELLO",
};

const amazonHostUrl = "https://api.amazon.com";
const amazonCodePairUrl = amazonHostUrl + "/auth/O2/create/codepair";
const amazonTokenUrl    = amazonHostUrl + "/auth/O2/token";
const deviceSerialNumber = guid();
var clientID = "amzn1.application-oa2-client.dd4128302d614e0eb40254dde29ed9f6"; // localStorage.getItem("client_id");
var productID = "AGL"; // localStorage.getItem("product_id");

function guid() {
    function s4() {
      return Math.floor((1 + Math.random()) * 0x10000)
          .toString(16)
          .substring(1);
      }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}

function callVABinder(verb, query) {
    // ws.call return a Promise
    return alexaWs.call("alexa-voiceagent" + '/' + verb, query)
        .then(function (res) {
            return res;
        })
        .catch(function (err) {
            throw err;
    });
};

var alexaVAAddress;
function init() {
    alexaVAAddress = localStorage.getItem("alexa_va_address");
    document.getElementById("alexa-va-address").value = alexaVAAddress;
    if (alexaVAAddress != null) {
        connectToAlexaVA();
    }
}

var alexaVAConnected;
function connectToAlexaVA() {
    base.host = alexaVAAddress;
    afb = new AFB(base, "HELLO");

    function onopen() {
        document.getElementById("connected").innerHTML = "Connected";
        document.getElementById("connected").style.background = "lightgreen";
        alexaVAConnected = true;
        // Attempt to refresh token.
        refreshToken();
    }

    function onabort() {
        document.getElementById("connected").innerHTML = "Connected Closed";
        document.getElementById("connected").style.background = "red";
        alexaVAConnected = false;
    }

    alexaWs = new afb.ws(onopen, onabort);
}

var msgCount = 0;
function updateStatusMessage(message) {
    var currentdate = new Date(); 
    var datetime = currentdate.getDate() + "/"
        + (currentdate.getMonth()+1)  + "/" 
        + currentdate.getFullYear() + " @ "  
        + currentdate.getHours() + ":"  
        + currentdate.getMinutes() + ":" 
        + currentdate.getSeconds();
    const authStatusDiv = document.getElementById('cbl-auth-status');
    const authStatusMsg = document.createElement("p");

    msgCount++;
    authStatusMsg.innerHTML = msgCount + ") " + datetime + ": " + message;
    authStatusDiv.appendChild(authStatusMsg);    
}

function sendRequest(httpReq, paramsJson, url, responseCb) {
    httpReq.onreadystatechange = responseCb;
    var paramsQueryString = Object.keys(paramsJson).map(key => key + '=' + paramsJson[key]).join('&');
    httpReq.open("POST", url, true);
    httpReq.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
    httpReq.send(paramsQueryString);
}

var tokenRefreshFunc;
function updateAccessToken(tokenResponseJson) {
    if (alexaVAAddress === undefined || alexaVAAddress === null) {
        console.log("No Alexa VA. So not updating the access token.");
        return;
    }

    // store the access and refresh tokens.
    if (typeof(Storage) !== "undefined") {
        localStorage.setItem("access_token", tokenResponseJson["access_token"]);
        localStorage.setItem("refresh_token", tokenResponseJson["refresh_token"]);
    }

    // Set the auth token
    if (alexaVAConnected) {
        // Set new token
        const query = {"token": tokenResponseJson["access_token"]};
        callVABinder('setAuthToken', query);
        updateStatusMessage("Refreshed the access token of Alexa VA at " + alexaVAAddress);
    }

    // Refresh the token as soon as it expires.
    clearTimeout(tokenRefreshFunc);
    tokenRefreshFunc = setTimeout(refreshToken, tokenResponseJson["expires_in"] * 1000);
}

function refreshToken() {
    console.log("Attempting to refresh token for VA at: " + alexaVAAddress);

    var refreshToken = localStorage.getItem("refresh_token");
    if (refreshToken == null) {
        console.log("Error: No refresh token");
        return;
    }

    var paramsJson = {
        "grant_type":"refresh_token",
        "refresh_token":refreshToken,
        "client_id":clientID,
    };

    const tokenRefreshReq = new XMLHttpRequest();
    sendRequest(tokenRefreshReq, paramsJson, amazonTokenUrl, function() {
        if (tokenRefreshReq.readyState == 4) {
            if (tokenRefreshReq.status == 200) {
                console.log("Got access token " + tokenRefreshReq.responseText);
                var tokenResponseJson = JSON.parse(tokenRefreshReq.responseText);
                updateAccessToken(tokenResponseJson);
            } else {
                console.log("Failed to refresh access token: " + tokenRefreshReq.responseText);
            }
        }
    });
}

function displayUserCodeAndURI(authResponseJson) {
    const modal = document.getElementById('cbl-code-dialog');
    const cblStatusDiv = document.getElementById('cbl-code-div');
    const cblStatusMsg = document.getElementById('cbl-code-para');
    const blank = "_blank";

    var cblPage = authResponseJson["verification_uri"] + "?cbl-code=" + authResponseJson["user_code"]
    var msg = "To use Alexa,you must sign in to Amazon.<br> Go to " +
        "<a href=" + cblPage + "  target="+ blank+ " >" +
        cblPage + "</a>";
    cblStatusMsg.innerHTML = msg;
    cblStatusDiv.appendChild(cblStatusMsg);
    modal.appendChild(cblStatusDiv);

    const closeBtn = document.getElementById('cbl-code-close');
    closeBtn.addEventListener('click', (evt) => {
        modal.close();
    });
    closeBtn.style = "margin: 10px";
    closeBtn.innerHTML = "Close";
    modal.appendChild(closeBtn);

    modal.showModal()
}

function login() {
    alexaVAAddress = document.getElementById('alexa-va-address').value;
    if (alexaVAAddress == null) {
        console.log("Error: No Alexa VA address");
        return;
    }

    var reqJson = {
        "response_type": "device_code",
        "client_id": clientID,
        "scope":"alexa:all",
        "scope_data": JSON.stringify({
            "alexa:all": {
                "productID":productID,
                "productInstanceAttributes" : {
                    "deviceSerialNumber": deviceSerialNumber
                }
            }
        })
    };

    const authReq = new XMLHttpRequest();
    var tokenUrl = amazonTokenUrl;
    sendRequest(authReq, reqJson, amazonCodePairUrl, function() {
        if (authReq.readyState == 4) {
            if (authReq.status == 200) {
                var authResponse = JSON.parse(authReq.responseText);
                console.log("Got auth codepair " + authReq.responseText);
                displayUserCodeAndURI(authResponse);
                var maxTokenReqCnt = authResponse["expires_in"] / authResponse["interval"];
                var tokenReqFuncId = setTimeout(function tokenReqFunc() {
                    var reqJson = {
                        "grant_type":"device_code",
                        "device_code":authResponse["device_code"],
                        "user_code":authResponse["user_code"]
                    };
                    const tokenReq = new XMLHttpRequest();
                    sendRequest(tokenReq, reqJson, tokenUrl, function() {
                        if (tokenReq.readyState == 4) {
                            if (tokenReq.status == 200) {
                                console.log("Got access token " + tokenReq.responseText);
                                var tokenResponseJson = JSON.parse(tokenReq.responseText);
                                // Update the localstorage only when we have the access token.
                                localStorage.setItem("alexa_va_address", alexaVAAddress);
                                updateAccessToken(tokenResponseJson);
                            }
                            else {
                                maxTokenReqCnt--;
                                console.log("Retrying... " + tokenReq.responseText);
                                setTimeout(tokenReqFunc, authResponse["interval"] * 1000);
                            }
                        }
                    });
                }, authResponse["interval"] * 1000);
                // Cancel if max token request attempts are reached.
                if (maxTokenReqCnt == 0) {
                    console.log("Reached max token request attemps limit.");
                }
            } else {
                console.log(authReq.status);
            }
        }
    });
}