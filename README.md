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
* Stop playback
* Leave any group you are in

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
            ]
        }
    ]
}
```

**zones**: An array of all zone (e.g. rooms) that you want the plugin to expose to HomeKit.

**name**: The name of the zone. Must match the name in the Sonos app.

**isNightModeEnabled** (optional): If set to true, a switch is exposed for the night mode. (only for Playbar/Playbase)

**isSpeechEnhancementEnabled** (optional): If set to true, a switch is exposed for the speech enhancement. (only for Playbar/Playbase)

**priorities** (optional): If provided, this list of zone names defines the priority when searching for a music/TV stream to play when the accessories is switched to ON.

## Tips

* Configure your router to provide all Sonos devices with static IP addresses
* You can add conditions to the HomeKit automations to prevent Sonos devices from playing at night (e.g. only switch ON between 6am and 10pm)
* The automatic switching to the TV input (Playbar/Playbase) works well with this plugin
* If your HomeKit motion sensors do not support an occupancy mode (i.e. they only show "motion detected" for some seconds), you can use delay switches (e.g. **homebridge-delay-switch**) with a timeout of some minutes to switch the Sonos accessories ON and OFF.
