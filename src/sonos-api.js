
const http = require('http');
const url = require('url');

/**
 * Represents the API.
 * @param platform The SonosMultiroomPlatform instance.
 */
function SonosApi(platform) {
    const api = this;

    // Sets the platform
    api.platform = platform;

    // Checks if all required information is provided
    if (!api.platform.config.apiPort) {
        api.platform.log('No API port provided.');
        return;
    }
    if (!api.platform.config.apiToken) {
        api.platform.log('No API token provided.');
        return;
    }

    // Starts the server
    try {
        http.createServer(function (request, response) {
            const payload = [];

            // Subscribes for events of the request
            request.on('error', function () {
                api.platform.log('API - Error received.');
            }).on('data', function (chunk) {
                payload.push(chunk);
            }).on('end', function () {

                // Subscribes to errors when sending the response
                response.on('error', function () {
                    api.platform.log('API - Error sending the response.');
                });

                // Validates the token
                if (!request.headers['authorization']) {
                    api.platform.log('Authorization header missing.');
                    response.statusCode = 401;
                    response.end();
                    return;
                }
                if (request.headers['authorization'] !== api.platform.config.apiToken) {
                    api.platform.log('Token invalid.');
                    response.statusCode = 401;
                    response.end();
                    return;
                }

                // Validates the endpoint
                const endpoint = api.getEndpoint(request.url);
                if (!endpoint) {
                    api.platform.log('No endpoint found.');
                    response.statusCode = 404;
                    response.end();
                    return;
                }
            
                // Validates the body
                let body = null;
                if (payload && payload.length > 0) {
                    body = JSON.parse(Buffer.concat(payload).toString());
                }
                
                // Performs the action based on the endpoint and method
                switch (endpoint.name) {
                    case 'propertyByZone':
                        switch (request.method) {
                            case 'GET':
                                api.handleGetPropertyByZone(endpoint, response);
                                return;
                        }
                        break;

                    case 'zone':
                        switch (request.method) {
                            case 'GET':
                                api.handleGetZone(endpoint, response);
                                return;

                            case 'POST':
                                api.handlePostZone(endpoint, body, response);
                                return;
                        }
                        break;
                }

                api.platform.log('No action matched.');
                response.statusCode = 404;
                response.end();
            });
        }).listen(api.platform.config.apiPort, "0.0.0.0");
        api.platform.log('API started.');
    } catch (e) {
        api.platform.log('API could not be started: ' + JSON.stringify(e));
    }
}

/**
 * Handles requests to GET /zones/{zoneName}/{propertyName}.
 * @param endpoint The endpoint information.
 * @param response The response object.
 */
SonosApi.prototype.handleGetPropertyByZone = function (endpoint, response) {
    const api = this;

    // Checks if the zone exists
    const zoneMasterDevice = api.platform.devices.find(function(d) { return d.zoneName === endpoint.zoneName && d.isZoneMaster; });
    if (!zoneMasterDevice) {
        api.platform.log('Zone not found.');
        response.statusCode = 400;
        response.end();
        return;
    }

    // Gets the value based on property name
    let promise = null;
    let content = null;
    switch (endpoint.propertyName) {
        case 'led-state':
            promise = zoneMasterDevice.sonos.getLEDState().then(function(state) { content = (state === 'On').toString(); });
            break;

        case 'current-state':
            promise = api.platform.getGroupPlayState(zoneMasterDevice).then(function(playState) { content = playState; });
            break;

        case 'volume':
            promise = zoneMasterDevice.sonos.getVolume().then(function(volume) { content = volume.toString(); });
            break;

        case 'current-track-uri':
            promise = zoneMasterDevice.sonos.currentTrack().then(function(currentTrack) { 
                if (!currentTrack || !currentTrack.uri) {
                    content = 'null';
                } else if (currentTrack.uri.endsWith(':spdif')) {
                    content = 'TV';
                } else {
                    content = currentTrack.uri;
                }
            });
            break;

        default:
            api.platform.log('Property not found.');
            response.statusCode = 400;
            response.end();
            return;
    }

    // Writes the response
    promise.then(function() {
        response.setHeader('Content-Type', 'text/plain');
        response.write(content);
        response.statusCode = 200;
        response.end();
    }, function() {
        api.platform.log('Error while retrieving value.');
        response.statusCode = 400;
        response.end();
    });
}

/**
 * Handles requests to GET /zones/{zoneName}.
 * @param endpoint The endpoint information.
 * @param response The response object.
 */
SonosApi.prototype.handleGetZone = function (endpoint, response) {
    const api = this;

    // Checks if the zone exists
    const zoneMasterDevice = api.platform.devices.find(function(d) { return d.zoneName === endpoint.zoneName && d.isZoneMaster; });
    if (!zoneMasterDevice) {
        api.platform.log('Zone not found.');
        response.statusCode = 400;
        response.end();
        return;
    }

    // Gets all properties
    const promises = [];
    const responseObject = {};
    promises.push(zoneMasterDevice.sonos.getLEDState().then(function(state) { responseObject['led-state'] = state === 'On'; }));
    promises.push(api.platform.getGroupPlayState(zoneMasterDevice).then(function(playState) { responseObject['current-state'] = playState; }));
    promises.push(zoneMasterDevice.sonos.getVolume().then(function(volume) { responseObject['volume'] = volume; }));
    promises.push(zoneMasterDevice.sonos.currentTrack().then(function(currentTrack) { 
        if (!currentTrack || !currentTrack.uri) {
            responseObject['current-track-uri'] = null;
        } else if (currentTrack.uri.endsWith(':spdif')) {
            responseObject['current-track-uri'] = 'TV';
        } else {
            responseObject['current-track-uri'] = currentTrack.uri;
        }
    }));

    // Writes the response
    Promise.all(promises).then(function() {
        response.setHeader('Content-Type', 'application/json');
        response.write(JSON.stringify(responseObject));
        response.statusCode = 200;
        response.end();
    }, function() {
        api.platform.log('Error while retrieving values.');
        response.statusCode = 400;
        response.end();
    });
}

/**
 * Handles requests to POST /zones/{zoneName}.
 * @param endpoint The endpoint information.
 * @param body The body of the request.
 * @param response The response object.
 */
SonosApi.prototype.handlePostZone = function (endpoint, body, response) {
    const api = this;

    // Checks if the zone exists
    const zoneMasterDevice = api.platform.devices.find(function(d) { return d.zoneName === endpoint.zoneName && d.isZoneMaster; });
    if (!zoneMasterDevice) {
        api.platform.log('Zone not found.');
        response.statusCode = 400;
        response.end();
        return;
    }

    // Validates the content
    if (!body) {
        api.platform.log('Body invalid.');
        response.statusCode = 400;
        response.end();
        return;
    }

    // Sets the new value
    const promises = [];
    for (let propertyName in body) {
        const zonePropertyValue = body[propertyName];
        switch (propertyName) {
            case 'led-state':
                promises.push(zoneMasterDevice.sonos.setLEDState(zonePropertyValue === true ? 'On' : 'Off'));
                break;
            
            case 'current-state':
                if (zonePropertyValue == 'playing') {
                    promises.push(zoneMasterDevice.sonos.play());
                } else if (zonePropertyValue == 'paused') {
                    promises.push(zoneMasterDevice.sonos.pause());
                } else if (zonePropertyValue == 'stopped') {
                    promises.push(zoneMasterDevice.sonos.stop().catch(function() { return zoneMasterDevice.sonos.leaveGroup(); }));
                } else if (zonePropertyValue == 'previous') {
                    promises.push(zoneMasterDevice.sonos.previous());
                } else if (zonePropertyValue == 'next') {
                    promises.push(zoneMasterDevice.sonos.next());
                }
                break;

            case 'current-track-uri':
                promises.push(zoneMasterDevice.sonos.play(zonePropertyValue));
                break;

            case 'adjust-volume':
                promises.push(zoneMasterDevice.sonos.adjustVolume(zonePropertyValue));
                break;

            case 'mute':
                promises.push(zoneMasterDevice.sonos.setMuted(zonePropertyValue));
                break;

            case 'volume':
                promises.push(zoneMasterDevice.sonos.setVolume(zonePropertyValue));
                break;
        }
    }

    // Writes the response
    Promise.all(promises).then(function() {
        response.statusCode = 200;
        response.end();
    }, function() {
        api.platform.log('Error while setting value.');
        response.statusCode = 400;
        response.end();
    });
}

/**
 * Gets the endpoint information based on the URL.
 * @param uri The uri of the request.
 * @returns Returns the endpoint information.
 */
SonosApi.prototype.getEndpoint = function (uri) {

    // Parses the request path
    const uriParts = url.parse(uri);

    // Checks if the URL matches the zones endpoint with property name
    let uriMatch = /\/zones\/(.+)\/(.+)/g.exec(uriParts.pathname);
    if (uriMatch && uriMatch.length === 3) {
        return {
            name: 'propertyByZone', 
            zoneName: decodeURI(uriMatch[1]),
            propertyName: decodeURI(uriMatch[2])
        };
    }

    // Checks if the URL matches the zones endpoint without property name
    uriMatch = /\/zones\/(.+)/g.exec(uriParts.pathname);
    if (uriMatch && uriMatch.length === 2) {
        return {
            name: 'zone',
            zoneName: decodeURI(uriMatch[1])
        };
    }

    // Returns null as no endpoint matched.
    return null;
}

/**
 * Defines the export of the file.
 */
module.exports = SonosApi;
