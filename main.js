const discord = require('discord.js-selfbot')
const Client = require('discord.js');
const client = new discord.Client()
const ayarlar = require('./Config.json');
const mongoose = require('mongoose');
mongoose.connect(ayarlar.MongoUrl, {useNewUrlParser: true, useUnifiedTopology: true});
const Database = require("./models/role.js");


client.on("ready", async () => {// user token olarak dağıtacağım için oynuyor ve sese bağlanma kısımlarını devredışı bıraktım isterseniz /* bunları silerek aktif hale getirebilirsiniz
/*  client.user.setPresence({ activity: { name: "Banker was Here" }, status: "invisible" }); 
    let botVoiceChannel = client.channels.cache.get(ayarlar.botVoiceChannelID);
    if (botVoiceChannel) botVoiceChannel.join().catch(err => console.error("Bot ses kanalına bağlanamadı!"));*/
    setRoleBackup();
    setInterval(() => {
      setRoleBackup();
    }, 1000*60*60*1);
  });


function guvenli(kisiID) {
  let uye = client.guilds.cache.get(ayarlar.guildID).members.cache.get(kisiID);
  let guvenliler = ayarlar.whitelist || [];
  if (!uye || uye.id === client.user.id || uye.id === ayarlar.botOwner || uye.id === uye.guild.owner.id || guvenliler.some(g => uye.id === g.slice(1) || uye.roles.cache.has(g.slice(1)))) return true
  else return false;
};

client.on("roleDelete", async role => {
  let entry = await role.guild.fetchAuditLogs({type: 'ROLE_DELETE'}).then(audit => audit.entries.first());
  if (!entry || !entry.executor || Date.now()-entry.createdTimestamp > 5000 || guvenli(entry.executor.id) || !ayarlar.roleGuard) return;
  cezalandir(entry.executor.id, "ban");
  let yeniRol = await role.guild.roles.create({
    data: {
      name: role.name,
      color: role.hexColor,
      hoist: role.hoist,
      position: role.rawPosition,
      permissions: role.permissions,
      mentionable: role.mentionable
    },
    reason: "Rol Silindiği İçin Tekrar Oluşturuldu!"
  });

  Database.findOne({guildID: role.guild.id, roleID: role.id}, async  roleData => {
    if (!roleData) return;
    setTimeout(() => {
        let kanalPermVeri = roleData.channelOverwrites;
        if (kanalPermVeri) kanalPermVeri.forEach((perm, index) => {
          let kanal = role.guild.channels.cache.get(perm.id);
          if (!kanal) return;
          setTimeout(() => {
            let yeniKanalPermVeri = {};
            perm.allow.forEach(p => {
              yeniKanalPermVeri[p] = true;
            });
            perm.deny.forEach(p => {
              yeniKanalPermVeri[p] = false;
            });
            kanal.createOverwrite(yeniRol, yeniKanalPermVeri).catch(console.error);
          }, index*300);
        });
      }, 300)
    let roleMembers = roleData.members;
    roleMembers.forEach((member, index) => {
      let uye = role.guild.members.cache.get(member);
      if (!uye || uye.roles.cache.has(yeniRol.id)) return;
      setTimeout(() => {
        uye.roles.add(yeniRol.id).catch();
      }, index*100);
    });
  });

  let logKanali = client.channels.cache.get(ayarlar.logChannelID);
  if (logKanali)  logKanali.send(`@everyone \n${role.name} \`${role.id}\` Rolü Silindi Silen Kişiyi Banlayıp Üyelere ve Kanal İzinlerine Ekliyorum!`)
});

function setRoleBackup() {
  let guild = client.guilds.cache.get(ayarlar.guildID);
  if (guild) {
    guild.roles.cache.filter(r => r.name !== "@everyone" && !r.managed).forEach(role => {

      Database.findOne({guildID: ayarlar.guildID, roleID: role.id}, async (err, savedRole) => {
        if (!savedRole) {
          let newRoleSchema = new Database({
            _id: new mongoose.Types.ObjectId(),
            guildID: ayarlar.guildID,
            roleID: role.id,
            name: role.name,
            color: role.hexColor,
            hoist: role.hoist,
            position: role.position,
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
          savedRole.position = role.position;
          savedRole.permissions = role.permissions;
          savedRole.mentionable = role.mentionable;
          savedRole.time = Date.now();
          savedRole.members = role.members.map(m => m.id);
          savedRole.channelOverwrites = roleChannelOverwrites;

          savedRole.save();
        };
      });
    });

    Database.find({guildID: ayarlar.guildID}).sort().exec((err, roles) => {
      roles.filter(r => !guild.roles.cache.has(r.roleID) && Date.now()-r.time > 1000*60*60*24*3).forEach(r => {
        Database.findOneAndDelete({roleID: r.roleID});
      });
    });
    console.log(` 1 Saatlik Rol veri tabanı düzenlendi!`);
  };
};
client.login(ayarlar.Token).then(c => console.log(`[Backup] ${client.user.tag} Successfully Logged !`))
