const { EmbedBuilder, PermissionsBitField } = require("discord.js");

async function getFreeBalance(member, db) {
    if (!db) return 0;
    
    const levelDataRes = await db.query("SELECT mora, bank FROM levels WHERE userid = $1 AND guildid = $2", [member.id, member.guild.id]);
    const levelData = levelDataRes.rows[0];
    const currentMora = levelData ? (levelData.mora || 0) : 0;
    const currentBank = levelData ? (levelData.bank || 0) : 0;
    
    const totalWealth = currentMora + currentBank;

    const loanDataRes = await db.query("SELECT remainingamount FROM user_loans WHERE userid = $1 AND guildid = $2", [member.id, member.guild.id]);
    const loanData = loanDataRes.rows[0];
    const debt = loanData ? loanData.remainingamount : 0;

    const freeBalance = totalWealth - debt;
    
    return Math.max(0, freeBalance);
}

async function sendLevelUpMessage(interaction, member, newLevel, oldLevel, xpData, db) {
     try {
         const settingsRes = await db.query("SELECT * FROM settings WHERE guild = $1", [interaction.guild.id]);
         let customSettings = settingsRes.rows[0];
         
         const channelRes = await db.query("SELECT * FROM channel WHERE guild = $1", [interaction.guild.id]);
         let channelLevel = channelRes.rows[0];
         
         let levelUpContent = null;
         let embed;

         if (customSettings && (customSettings.lvluptitle || customSettings.lvlUpTitle)) {
             const title = customSettings.lvluptitle || customSettings.lvlUpTitle;
             const desc = customSettings.lvlupdesc || customSettings.lvlUpDesc;
             const color = customSettings.lvlupcolor || customSettings.lvlUpColor || "Random";
             const image = customSettings.lvlupimage || customSettings.lvlUpImage;
             const mention = customSettings.lvlupmention !== undefined ? customSettings.lvlupmention : customSettings.lvlUpMention;

             function antonymsLevelUp(string) {
                 return string
                    .replace(/{member}/gi, `${member}`)
                    .replace(/{level}/gi, `${newLevel}`)
                    .replace(/{level_old}/gi, `${oldLevel}`)
                    .replace(/{xp}/gi, `${xpData.xp || 0}`)
                    .replace(/{totalXP}/gi, `${xpData.totalxp || xpData.totalXP || 0}`)
                    .replace(/{mora}/gi, `${(xpData.mora || 0).toLocaleString()}`); 
             }
             
             embed = new EmbedBuilder()
                 .setTitle(antonymsLevelUp(title))
                 .setDescription(antonymsLevelUp(desc.replace(/\\n/g, '\n')))
                 .setColor(color)
                 .setTimestamp();
                 
             if (image) { embed.setImage(antonymsLevelUp(image)); }
             if (mention == 1) { levelUpContent = `${member}`; }
         } else {
             embed = new EmbedBuilder()
                 .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL({ dynamic: true }) })
                 .setColor("Random")
                 .setDescription(`**Congratulations** ${member}! You have now leveled up to **level ${newLevel}**`);
         }

         let channelToSend = interaction.channel;
         if (channelLevel && channelLevel.channel !== "Default") {
               channelToSend = interaction.guild.channels.cache.get(channelLevel.channel) || interaction.channel;
         }
         if (!channelToSend) return;

         const permissionFlags = channelToSend.permissionsFor(interaction.guild.members.me);
         if (permissionFlags.has(PermissionsBitField.Flags.SendMessages) && permissionFlags.has(PermissionsBitField.Flags.ViewChannel)) {
             await channelToSend.send({ content: levelUpContent, embeds: [embed] }).catch(e => console.error(`[LevelUp Send Error]: ${e.message}`));
         }
    } catch (err) {
         console.error(`[LevelUp Error]: ${err.message}`);
    }
}

module.exports = {
    sendLevelUpMessage,
    getFreeBalance 
};
