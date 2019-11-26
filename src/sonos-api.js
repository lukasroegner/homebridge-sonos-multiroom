
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

                // Parses the request path
                const urlParts = url.parse(request.url);
                const urlMatch = /\/zones\/(.+)\/values\/(.+)/g.exec(urlParts.pathname);
                if (!urlMatch || urlMatch.length !== 3) {
                    api.platform.log('Request not valid.');
                    response.statusCode = 400;
                    response.end();
                    return;
                }
                
                // Checks if the zone exists
                const zone = api.platform.zones.find(function(z) { return z.name === decodeURI(urlMatch[1]); });
                if (!zone) {
                    api.platform.log('Zone not found.');
                    response.statusCode = 400;
                    response.end();
                    return;
                }
                
                // Gets the property
                const zoneProperty = decodeURI(urlMatch[2]);

                // Gets the HTTP method
                if (request.method === 'GET') {
                    switch (zoneProperty) {
                        case 'led-state':
                            zone.sonos.getLEDState().then(function(state) {
                                response.setHeader('Content-Type', 'text/plain');
                                response.write((state === 'On').toString());
                                response.statusCode = 200;
                                response.end();
                            }, function() {
                                api.platform.log('Error while retrieving value.');
                                response.statusCode = 400;
                                response.end();
                            });
                            break;

                        case 'volume':
                            zone.sonos.getVolume().then(function(volume) {
                                response.setHeader('Content-Type', 'text/plain');
                                response.write(volume);
                                response.statusCode = 200;
                                response.end();
                            }, function() {
                                api.platform.log('Error while retrieving value.');
                                response.statusCode = 400;
                                response.end();
                            });
                            break;

                        default:
                            api.platform.log('Property not found.');
                            response.statusCode = 400;
                            response.end();
                            break;
                    }
                    return;
                }
                if (request.method === 'POST') {
                        
                    // Generates the request string
                    const content = JSON.parse(Buffer.concat(payload).toString());

                    // Sets the new value
                    switch (zoneProperty) {
                        case 'volume':
                            const promises = [];
                            promises.push(zone.sonos.setLEDState(content === 'true' ? 'On' : 'Off'));
                            for (let i = 0; i < zone.sonosSlaves.length; i++) {
                                const sonosSlave = zone.sonosSlaves[i];
                                promises.push(sonosSlave.setLEDState(content === 'true' ? 'On' : 'Off'));
                            }
                            Promise.all(promises).then(function() {
                                response.statusCode = 200;
                                response.end();
                            }, function() {
                                api.platform.log('Error while setting value.');
                                response.statusCode = 400;
                                response.end();
                            });
                            break;
                        
                        case 'volume':
                            zone.sonos.setVolume(parseInt(content)).then(function() {
                                response.statusCode = 200;
                                response.end();
                            }, function() {
                                api.platform.log('Error while setting value.');
                                response.statusCode = 400;
                                response.end();
                            });
                            break;

                        default:
                            api.platform.log('Property not found.');
                            response.statusCode = 400;
                            response.end();
                            break;
                    }
                    return;
                }
                api.platform.log('HTTP method invalid.');
                response.statusCode = 400;
                response.end();
            });
        }).listen(api.platform.config.apiPort, "0.0.0.0");
        api.platform.log('API started.');
    } catch (e) {
        api.platform.log('API could not be started: ' + JSON.stringify(e));
    }
}

/**
 * Defines the export of the file.
 */
module.exports = SonosApi;
