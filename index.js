// initialize config
var { hiveSenderAddress, hiveActivePrivateKey, twitchChannel, twitchUsername, twitchOauthToken } = require('./config.json');
hiveSenderAddress = hiveSenderAddress.toLowerCase();
twitchChannel = twitchChannel.toLowerCase();
twitchUsername = twitchUsername.toLowerCase();

// initialize database
const sqlite3 = require('sqlite3');
const viewers_db = new sqlite3.Database('./viewers.db');
viewers_db.run("CREATE TABLE IF NOT EXISTS viewers (userid TEXT, username TEXT, hive_address TEXT, hive_status INT, updated_at TEXT)", [], (err) => {
  if (err) {
    console.log(err.message);
  }
});

// initialize hive client
const dhive = require("@hiveio/dhive");
let opts = {};
opts.addressPrefix = 'STM';
opts.chainId = 'beeab0de00000000000000000000000000000000000000000000000000000000';
const hiveClient = new dhive.Client(["https://api.hive.blog", "https://api.hivekings.com", "https://anyx.io", "https://api.openhive.network"], opts);
const hiveKey = dhive.PrivateKey.fromString(hiveActivePrivateKey);

// initialize twitch client
const tmi = require('tmi.js');
const twitchClient = new tmi.Client({
        options: { debug: false },
        connection: {
                secure: true,
                reconnect: true
        },
        identity: {
                username: twitchUsername,
                password: twitchOauthToken
        },
        channels: [ twitchChannel ]
});
twitchClient.connect().then((data) => {}).catch((err) => {});
twitchClient.on('message', (channel, tags, message, self) => {
  if (self) return;
  var username = tags.username;
  var userid = tags['user-id'];
  processMessage(channel, message, username, userid);
});

const https = require('https');

const sleep = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const getTwitchChatters = (channel) => {
  if (channel.startsWith('#')) {
    channel = channel.substr(1);
  }
  var chatters = [];
  var rest_options = {
    host: 'gql.twitch.tv',
    port: 443,
    path: '/gql',
    method: 'POST',
    headers: {
      'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko'
    }
  }
  var post_data = {
    operationName: 'ChatViewers',
    variables: {
        channelLogin: channel
        },
    extensions: {
        persistedQuery: {
            version: 1,
            sha256Hash: 'e0761ef5444ee3acccee5cfc5b834cbfd7dc220133aa5fbefe1b66120f506250'
            }
        }
  }
  return new Promise ((resolve, reject) => {
    var request = https.request(rest_options, (response) => {
      var content = "";
      response.on('data', function(chunk) {
        content += chunk;
      });
      response.on('end', function() {
        try {
          let data = JSON.parse(content);
          if (data.data.channel.chatters.staff !== undefined) {
            data.data.channel.chatters.staff.forEach(function(staff) {
              chatters.push(staff.login);
            });
          }
          if (data.data.channel.chatters.moderators !== undefined) {
            data.data.channel.chatters.moderators.forEach(function(moderator) {
              chatters.push(moderator.login);
            });
          }
          if (data.data.channel.chatters.vips !== undefined) {
            data.data.channel.chatters.vips.forEach(function(vip) {
              chatters.push(vip.login);
            });
          }
          if (data.data.channel.chatters.viewers !== undefined) {
            data.data.channel.chatters.viewers.forEach(function(viewer) {
              chatters.push(viewer.login);
            });
          }
          resolve(chatters);
          return;
        }
        catch(error) {
          reject('invalid response from api server');
          return;
        }
      });
    });
    request.write(JSON.stringify(post_data));
    request.on('error', function(error) {
      reject('error while calling api endpoint');
    });
    request.end();
  });
}

const getHiveBalance = (address) => {
  return new Promise ((resolve, reject) => {
    (async () => {
      try {
        const result = await hiveClient.database.call('get_accounts', [[address]]);
        var hive_balance = result[0].balance;
        if (hive_balance.indexOf(' HIVE') != -1) {
          hive_balance = hive_balance.substring(0, hive_balance.indexOf(' HIVE'));
          resolve(parseFloat(hive_balance));
          return;
        }
        else {
          reject("balance could not be retrieved");
          return;
        }
      } catch (err) {
        reject("account does not exist");
      }
    })();
  });
}

const sendHive = (source, address, quantity) => {
  return new Promise ((resolve, reject) => {
    quantity = parseFloat(quantity);
    if (address == source) {
      resolve("success");
      return;
    }
    quantity = Math.floor(quantity * 1000) / 1000;
    quantityString = quantity.toFixed(3) + ' HIVE';
    (async () => {
      const transf = new Object();
      transf.from = source;
      transf.to = address;
      transf.amount = quantityString;
      transf.memo = '';

      hiveClient.broadcast.transfer(transf, hiveKey).then(
        (result) => {
          resolve("success");
        },
        (error) => {
          reject("insufficient resources");
        }
      );
    })();
  });
}

const setHiveAddress = (userid, username, address) => {
  return new Promise ((resolve, reject) => {
    (async () => {
      const search_accounts = await hiveClient.database.call('lookup_accounts', [address, 1]);
      if (search_accounts.length > 0 && search_accounts[0] == address) {
        viewers_db.serialize(() => {
          viewers_db.get("SELECT * FROM viewers WHERE userid = ?", [userid], (err,row) => {
            if (row === undefined) {
              viewers_db.run("INSERT INTO viewers(userid,username,hive_address,hive_status,updated_at) VALUES(?,?,?,?,datetime('now'))", [userid, username, address, 1], (err) => {
                if (err) {
                  reject(err.message);
                }
                else {
                  resolve("success");
                }
              });
            }
            else {
              viewers_db.run("UPDATE viewers SET username = ?, hive_address = ?, updated_at = datetime('now') WHERE userid = ?", [username, address, userid], (err) => {
                if (err) {
                  reject(err.message);
                }
                else {
                  resolve("success");
                }
              });
            }
          });
        });
      }
      else {
        reject("HIVE address is not valid or does not exist");
      }
    })();
  });
}

const getHiveAddressByUsername = (username) => {
  return new Promise ((resolve, reject) => {
    viewers_db.get("SELECT * FROM viewers WHERE username = ?", [username], function(err,row) {
      if (row === undefined) {
        resolve(false);
      }
      else {
        if (row.hive_address != undefined) {
          resolve(row.hive_address);
        }
        else {
          resolve(false);
        }
      }
      if (err) {
        reject(err.message);
      }
    });
  });
}

const processHiveRain = (channel, username, amount) => {
  var hive_rain_error = 0;
  var valid_addresses = [];
  return new Promise (async (resolve, reject) => {
    try {
      let chatters = await getTwitchChatters(channel);
      for (var i = 0; i < chatters.length; i++) {
        let viewer_address = await getHiveAddressByUsername(chatters[i]);
        if (viewer_address != false && chatters[i] != channel) {
          valid_addresses.push(viewer_address);
        }
      }
      if (valid_addresses.length <= 0) {
        resolve('@' + username + ' no valid, active viewers found');
        return;
      }
      else {
        var split = amount / valid_addresses.length;
        if (split < 0.001) {
          resolve('@' + username + ' split is less than minimum amount of 0.001 HIVE');
          return;
        }
        (async () => {
          for(var i = 0; i < valid_addresses.length; i++) {
            try {
              await sendHive(hiveSenderAddress, valid_addresses[i], split);
              await sleep(250);
            }
            catch (error) {
              hive_rain_error = 1;
            }
          }
          if (hive_rain_error == 0)
            twitchClient.say(channel,'@' + username + ' ' + roundSplit(split) + ' HIVE sent to each valid, active viewer');
          else
            twitchClient.say(channel,'@' + username + ' insufficient resources');
        })();
        if (valid_addresses.length > 1)
          resolve('@' + username + ' raining ' + amount + ' HIVE to ' + valid_addresses.length + ' valid, active viewers...');
        else
          resolve('@' + username + ' raining ' + amount + ' HIVE to ' + valid_addresses.length + ' valid, active viewer...');
      }
    }
    catch (error) {
      resolve('@' + username + ' ' + error);
    }
  });
}

const roundSplit = (split) => {
  if (split >= 0.1) {
    return Math.floor(split * 100) / 100;
  }
  else if (split < 0.1) {
    var zeroes = -Math.floor( Math.log(split) / Math.log(10) + 1);
    var multiplier = 100 * Math.pow(10, zeroes);
    return Math.floor(split * multiplier) / multiplier;
  }
}

const processMessage = (channel, message, username, user_id) => {
  if (message.startsWith('$') || message.startsWith('!'))
    message = message.substr(1);
  else
    return;

  if (message.startsWith('h ')) {
    if (twitchChannel != username)
      return;
    var amount = parseFloat(message.split(' ')[1]);
    if (amount < 0.001 || isNaN(amount)) {
      twitchClient.say(channel, username + ', amount has to be at least 0.001');
      return;
    }
    var address = message.split(' ')[2];
    if (address == null) {
      twitchClient.say(channel, '@' + username + ' recipient is required');
      return;
    }
    (async() => {
      try {
        var recipient = address;
        if (address.startsWith('@')) {
          recipient = address.substr(1);
        }
        recipient = recipient.toLowerCase();
        let hiveAddress = await getHiveAddressByUsername(recipient);
        if (hiveAddress == false) {
          twitchClient.say(channel, '@' + username + ' no HIVE address is set');
          return;
        }
        var status = await sendHive(hiveSenderAddress, hiveAddress, amount);
        twitchClient.say(channel, amount + ' HIVE sent to ' + address);
      }
      catch (error) {
        twitchClient.say(channel, '@' + username + ' ' + error);
      }
    })();
    return;
  }
  else if (message.startsWith('hrain ') || message.startsWith('hrian ')) {
    if (twitchChannel != username)
      return;
    var amount = parseFloat(message.split(' ')[1]);
    if (amount < 0.001 || isNaN(amount)) {
      twitchClient.say(channel, '@' + username + ' amount has to be at least 0.001');
      return;
    }
    (async() => {
      try {
        let balance = await getHiveBalance(hiveSenderAddress);
        if (parseFloat(amount) <= parseFloat(balance)) {
          let reply = await processHiveRain(channel, username, amount);
          twitchClient.say(channel, reply);
        }
        else {
          twitchClient.say(channel, '@' + username + ' insufficient funds');
        }
      }
      catch (error) {
        twitchClient.say(channel, '@' + username + ' insufficient resources');
      }
    })();
    return;
  }
  else if (message == 'hive' || message == 'ha') {
    (async() => {
      try {
        let address = await getHiveAddressByUsername(username);
        if (address == false) {
          twitchClient.say(channel, '@' + username + ' no HIVE address is set');
          return;
        }
        else {
          twitchClient.say(channel, '@' + username + ' HIVE address is set to ' + address);
        }
      }
      catch (error) {
        twitchClient.say(channel, '@' + username + ' database is unresponsive');
      }
    })();
    return;
  }
  else if (message.startsWith('hive ') || message.startsWith('ha ')) {
    var address = message.split(' ')[1];
    if (address == null) {
      twitchClient.say(channel, '@' + username + ' HIVE address is required');
      return;
    }
    address = address.toLowerCase();
    (async() => {
      try {
        let setAttempt = await setHiveAddress(user_id, username, address);
        twitchClient.say(channel, '@' + username + ' HIVE address is set');
      }
      catch (error) {
        twitchClient.say(channel, '@' + username + ' ' + error);
      }
    })();
    return;
  }
}
