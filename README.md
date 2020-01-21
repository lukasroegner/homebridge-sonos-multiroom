# homebridge-sonos-multiroom

This project is a homebridge plugin for the Sonos system. Instead of trying to support all features of the Sonos devices, it aims to provide a simple feature set while enabling a real multiroom experience.

## Who is it for?

The use case for this plugin is simple: you want your music or TV audio stream to follow you around in your home. This can be accomplished with a combination of this plugin and HomeKit motion/occupancy sensors.

## Which HomeKit accessories are provided?

The plugin exposes each zone (e.g. room) of your Sonos system as an outlet, which can be switched ON and OFF (you can also enable switches for night mode and speech enhancement for the Playbar and Playbase).

## How does multiroom handling work?

The exposed accessories have the following logic when being switched ON:
* Do nothing if the zone is already playing
* Check if there is another Sonos zone that is already playing (if more than one Sonos zones are currently playing, a priority list that can be configured is used to determine which group to enter)
* If found, enter the group of the Sonos zone that is already playing
* If not, start playback (which means the last source, stream or radio of the respective Sonos zone is played back)

The exposed accessories have the following logic when being switched OFF:
* Check if you are playing your TV stream (i.e. Playbar/Playbase)
* If so, do nothing (as TV stream should not be "paused")
* If not, stop playback and leave any group you are in

Now, create HomeKit automations for your motion/occupancy sensors for each room
* "If motion is detected, switch to ON"
* "If no motion is detected, switch to OFF"

**Result**: If you enter a room, it will automatically start playback of music/TV that is playing in another room. If you leave the room, music playback stops.

## Installation

Install the plugin via npm:

```bash
npm install homebridge-sonos-multiroom -g
```

## Configuration

```json
{
    "platforms": [
        {
            "platform": "SonosMultiroomPlatform",
            "discoveryTimeout": 5000,
            "zones": [
                {
                    "name": "Living Room",
                    "isNightModeEnabled": true,
                    "isSpeechEnhancementEnabled": true,
                    "priorities": [
                        "Bedroom",
                        "Bathroom"
                    ]
                },
                {
                    "name": "Bathroom",
                    "priorities": [
                        "Living Room",
                        "Bedroom"
                    ]
                },
                {
                    "name": "Bedroom",
                    "priorities": [
                        "Living Room",
                        "Bathroom"
                    ]
                }
            ],
            "isApiEnabled": false,
            "apiPort": 40809,
            "apiToken": "<YOUR-TOKEN>"
        }
    ]
}
```

**discoveryTimeout** (optional): Time span in milliseconds for which the plugin searches for Sonos devices. Defaults to `5000`.

**zones**: An array of all zone (e.g. rooms) that you want the plugin to expose to HomeKit.

**name**: The name of the zone. Must match the name in the Sonos app.

**isNightModeEnabled** (optional): If set to true, a switch is exposed for the night mode. Defaults to `false`. (only for Playbar/Playbase)

**isSpeechEnhancementEnabled** (optional): If set to true, a switch is exposed for the speech enhancement. Defaults to `false`. (only for Playbar/Playbase)

**priorities** (optional): If provided, this list of zone names defines the priority when searching for a music/TV stream to play when the accessories is switched to ON.

**isApiEnabled** (optional): Enables an HTTP API for controlling Sonos zones. Defaults to `false`. See **API** for more information.

**apiPort** (optional): The port that the API (if enabled) runs on. Defaults to `40809`, please change this setting of the port is already in use.

**apiToken** (optional): The token that has to be included in each request of the API. Is required if the API is enabled and has no default value.

## API

This plugin also provides an HTTP API to control some features of the Sonos system. It has been created so that you can further automate the system with HomeKit shortcuts. Starting with iOS 13, you can use shortcuts for HomeKit automation. Those automations that are executed on the HomeKit coordinator (i.e. iPad, AppleTV or HomePod) also support HTTP requests, which means you can automate your Sonos system without annoying switches and buttons exposed in HomeKit.

If the API is enabled, it can be reached at the specified port on the host of this plugin. 
```
http://<YOUR-HOST-IP-ADDRESS>:<apiPort>
```

The token has to be specified as value of the `Authorization` header on each request:
```
Authorization: <YOUR-TOKEN>
```

### API - Get values of Sonos zone

Use the `zones/<ZONE-NAME>/<PROPERTY-NAME>` endpoint to retrieve a single value of a Sonos zone. The HTTP method has to be `GET`:
```
http://<YOUR-HOST-IP-ADDRESS>:<apiPort>/zones/<ZONE-NAME>/<PROPERTY-NAME>
```

The response is a plain text response (easier to handle in HomeKit shortcuts), the following property names are supported:

* **let-state** The LED state of the master device of the zone (possible values: `true` if ON, `false` if OFF)
* **current-track-uri** The URI of the current track (possible values: `null`, `TV` or a URI)
* **current-state** The playback state of the zone (possible values: `playing`, `paused`, `stopped`)
* **volume** The current volume of the zone as integer value (range: `0-100`)
* **mute** Mute state as boolean (possible values: `true` if zone is muted, otherwise `false`).

Use the `zones/<ZONE-NAME>` endpoint to retrieve all values of a Sonos zone. The HTTP method has to be `GET`:
```
http://<YOUR-HOST-IP-ADDRESS>:<apiPort>/zones/<ZONE-NAME>
```

The response is a JSON object containing all values:
```
{
    "led-state": true,
    "current-track-uri": "http://..."
    "current-state": "playing",
    "volume": 16,
    "mute": false
}
```

### API - Set values of Sonos zone

Use the `zones/<ZONE-NAME>` endpoint to set values of a Sonos zone. The HTTP method has to be `POST`:
```
http://<YOUR-HOST-IP-ADDRESS>:<apiPort>/zones/<ZONE-NAME>
```

The body of the request has to be JSON containing the new values:
```
{
    "<PROPERTY-NAME>": <VALUE>
}
```
Multiple properties can be set with one request.

The following property names are supported:

* **let-state** The target LED state of all devices of the zone (possible values: `true` to switch on ON, `false` to switch OFF)
* **current-track-uri** Play the provided URI.
* **current-state** The target playback state of the zone (possible values: `playing`, `paused`, `stopped`, `next`, `previous`)
* **adjust-volume** The relative change of the volume as integer value. May also be negative.
* **mute** Mute/unmute the zone (possible values: `true`, `false`).
* **volume** The target volume of the zone as integer value (range: `0-100`)

## Tips

* Configure your router to provide all Sonos devices with static IP addresses
* You can add conditions to the HomeKit automations to prevent Sonos devices from playing at night (e.g. only switch ON between 6am and 10pm)
* The automatic switching to the TV input (Playbar/Playbase) works well with this plugin
* If your HomeKit motion sensors do not support an occupancy mode (i.e. they only show "motion detected" for some seconds), you can use delay switches (e.g. **homebridge-delay-switch**) with a timeout of some minutes to switch the Sonos accessories ON and OFF.
* Use HomeKit shortcuts to set a default volume for each zone in the early morning.
* Use HomeKit shortcuts to disable LEDs at night.
