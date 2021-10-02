const Discord = require('discord.js-selfbot')
const Client = require('discord.js')
const client = new Discord.Client()
const Config = require('./Config.json');
const mongoose = require('mongoose');
mongoose.connect(Config.MongoUrl, {useNewUrlParser: true, useUnifiedTopology: true});
const Database = require("./models/role.js");
function safe(kisiID) {
  let Member = client.guilds.cache.get(Config.GuildId).members.cache.get(kisiID);
  let Whitelisted = Config.whitelist || [];
  if (!Member || Member.id === client.user.id || Member.id === Config.botOwner || Member.id === Member.guild.owner.id || Whitelisted.some(g => Member.id === g.slice(1) || Member.roles.cache.has(g.slice(1)))) return true
  else return false;
};
client.on("ready", async () => {
  setRoleBackup();
  setInterval(() => {
    setRoleBackup();
  }, 1000*60*60*1);
});
client.on("roleDelete", async role => {
  let entry = await role.guild.fetchAuditLogs({type: 'ROLE_DELETE'}).then(audit => audit.entries.first());
  if (!entry || !entry.executor || Date.now()-entry.createdTimestamp > 5000 || safe(entry.executor.id)) return;
  await role.guild.members.ban(entry.executor.id, {reason: "Guard System!"})
   let newRole = await role.guild.roles.create({
    data: {name: role.name,color: role.hexColor,hoist: role.hoist,position: role.rawPosition,permissions: role.permissions,mentionable: role.mentionable } 
   });
  Database.findOne({guildID: role.guild.id, roleID: role.id}, async  roleData => {
    if (!roleData) return;
    setTimeout(() => {
        let kanalIzin = roleData.channelOverwrites;
        if (kanalIzin) kanalIzin.forEach((perm, index) => {
          let kanal = role.guild.channels.cache.get(perm.id);
          if (!kanal) return;
          setTimeout(() => {
            let yenikanalIzin = {};
            perm.allow.forEach(p => {
              yenikanalIzin[p] = true;
            });
            perm.deny.forEach(p => {
              yenikanalIzin[p] = false;
            });
            kanal.createOverwrite(newRole, yenikanalIzin).catch(console.error);
          }, index*2000);
        });
      }, 2000)
    let roleMembers = roleData.members;
    roleMembers.forEach((member, index) => {
      let Member = role.guild.members.cache.get(member);
      if (!Member || Member.roles.cache.has(newRole.id)) return;
      setTimeout(() => {
        Member.roles.add(newRole.id).catch();
      }, index*1000);
    });
  });

  let roleGuardLog = client.channels.cache.get(Config.LogChannelId);
  if (roleGuardLog)  roleGuardLog.send(`@everyone ${role.name} \`${role.id}\` Rolü Silindi Silen Kişiyi Banlayıp Üyelere ve Kanal İzinlerine Ekliyorum!`)
}); 

function setRoleBackup() {
  let guild = client.guilds.cache.get(Config.GuildId);
  if (guild) {
    guild.roles.cache.filter(r => r.name !== "@everyone" && !r.managed).forEach(role => {
      let roleChannelOverwrites = [];
      guild.channels.cache.filter(c => c.permissionOverwrites.has(role.id)).forEach(c => {
        let channelPerm = c.permissionOverwrites.get(role.id);
        let pushlanacak = { id: c.id, allow: channelPerm.allow.toArray(), deny: channelPerm.deny.toArray() };
        roleChannelOverwrites.push(pushlanacak);
      });
      Database.findOne({guildID: Config.GuildId, roleID: role.id}, async  savedRole => {
        if (!savedRole) {
          let newRoleSchema = new Database({
            _id: new mongoose.Types.ObjectId(),
            guildID: Config.GuildId,
            roleID: role.id,
            name: role.name,
            color: role.hexColor,
            hoist: role.hoist,
            position: role.rawPosition,
            permissions: role.permissions,
            mentionable: role.mentionable,
            time: Date.now(),
            members: role.members.map(m => m.id),
            channelOverwrites: roleChannelOverwrites
            
          });
          newRoleSchema.save();
        } else {
          savedRole.name = role.name;
          savedRole.color = role.hexColor;
          savedRole.hoist = role.hoist;
          savedRole.rawPosition = role.rawPosition;
          savedRole.permissions = role.permissions;
          savedRole.mentionable = role.mentionable;
          savedRole.time = Date.now();
          savedRole.members = role.members.map(m => m.id);
          savedRole.channelOverwrites = roleChannelOverwrites;
          savedRole.save();
        };
      });
    });
    Database.find({guildID: Config.GuildId}).sort().exec((err, roles) => {
      roles.filter(r => !guild.roles.cache.has(r.roleID) && Date.now()-r.time > 1000*60*60*24*3).forEach(r => {
        Database.findOneAndDelete({roleID: r.roleID});
      });
    });
 // let LogChannel = client.channels.cache.get(Config.LogChannelId);
// LogChannel.send(`1 Saatlik Rol Veri Tabanı Düzenlendi!`) eğer consol + kanala mesaj atmasını istiyorsanız // olan yerleri silin artık mesaj atıcaktır!
    console.log(`1 Saatlik Rol Veri Tabanı Düzenlendi!`);
  };
};
client.login(Config.Token).then(c => console.log(`[Backup] ${client.user.tag} Successfully Logged !`))
