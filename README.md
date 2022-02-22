# hivetwitchbot

![hivetwitchbot](https://raw.githubusercontent.com/ridsevilla/hivetwitchbot/main/logo.png)

## Installation

First, setup [Node.js](https://nodejs.org/en/).

Install the following:

```
npm install @hiveio/dhive sqlite3 tmi.js
```

Edit `config-default.json` with the appropriate values and save as `config.json`.

Storing your HIVE address' active private key in `config.json` is insecure and should not be used in production. Please use appropriate measures to secure your private keys and credentials before using in production.

You may generate your bot's Twitch OAuth Token with [https://twitchapps.com/tmi/](https://twitchapps.com/tmi/) (a Twitch community-driven wrapper around the Twitch API), while logged in to your bot's Twitch account. The token will be an alphanumeric string. To use in a production setting, it is recommended that you register your bot with Twitch and use a more secure OAuth Authorization code flow.

To run `hivetwitchbot`:

```
node index.js
```

## Usage

```
streamer commands:
-send hive: !h <amount> <twitch-viewer-tag>
-rain hive: !hrain <amount>

viewer commands:
-set hive wallet: !hive <address>
-view hive wallet: !hive

notes:
-shortform for !hive: !ha
-can interchange ! with $
```

## Thanks

Thanks to [verbalshadow](https://peakd.com/@verbalshadow) for the logo, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)!

---

HIVE: [ridsevilla](https://peakd.com/@ridsevilla)
