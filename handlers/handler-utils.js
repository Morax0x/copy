const { EmbedBuilder, PermissionsBitField } = require("discord.js");

// 🔥 الدالة المركزية الجديدة لحساب الـ XP المطلوب (المعادلة المزدوجة) 🔥
function calculateRequiredXP(level) {
    const lvl = Number(level) || 0;
    if (lvl < 35) {
        // المعادلة العادية للمبتدئين
        return 5 * (lvl ** 2) + (50 * lvl) + 100;
    } else {
        // المعادلة الصعبة (الجحيم) للمحترفين فوق 35
        return 15 * (lvl ** 2) + (150 * lvl);
    }
}

async function getFreeBalance(member, db) {
    if (!db) return 0;
    
    // 🔥 تم وضع أسماء الأعمدة بين علامات تنصيص لضمان المطابقة
    const levelDataRes = await db.query(`SELECT "mora", "bank" FROM levels WHERE "user" = $1 AND "guild" = $2`, [member.id, member.guild.id]);
    const levelData = levelDataRes.rows[0];
    const currentMora = levelData ? (Number(levelData.mora) || 0) : 0;
    const currentBank = levelData ? (Number(levelData.bank) || 0) : 0;
    
    const totalWealth = currentMora + currentBank;

    const loanDataRes = await db.query(`SELECT "remainingAmount" FROM user_loans WHERE "userID" = $1 AND "guildID" = $2`, [member.id, member.guild.id]);
    const loanData = loanDataRes.rows[0];
    const debt = loanData ? Number(loanData.remainingAmount) : 0;

    const freeBalance = totalWealth - debt;
    
    return Math.max(0, freeBalance);
}

async function sendLevelUpMessage(interaction, member, newLevel, oldLevel, xpData, db) {
     try {
         const settingsRes = await db.query(`SELECT * FROM settings WHERE "guild" = $1`, [interaction.guild.id]);
         let customSettings = settingsRes.rows[0];
         
         const channelRes = await db.query(`SELECT * FROM channel WHERE "guild" = $1`, [interaction.guild.id]);
         let channelLevel = channelRes.rows[0];
         
         let levelUpContent = null;
         let embed;

         if (customSettings && (customSettings.lvlUpTitle || customSettings.lvluptitle)) {
             const title = customSettings.lvlUpTitle || customSettings.lvluptitle;
             const desc = customSettings.lvlUpDesc || customSettings.lvlupdesc;
             const color = customSettings.lvlUpColor || customSettings.lvlupcolor || "Random";
             const image = customSettings.lvlUpImage || customSettings.lvlupimage;
             const mention = customSettings.lvlUpMention !== undefined ? customSettings.lvlUpMention : customSettings.lvlupmention;

             function antonymsLevelUp(string) {
                 return string
                    .replace(/{member}/gi, `${member}`)
                    .replace(/{level}/gi, `${newLevel}`)
                    .replace(/{level_old}/gi, `${oldLevel}`)
                    .replace(/{xp}/gi, `${xpData.xp || 0}`)
                    .replace(/{totalXP}/gi, `${xpData.totalXP || xpData.totalxp || 0}`)
                    .replace(/{mora}/gi, `${(Number(xpData.mora) || 0).toLocaleString()}`); 
             }
             
             embed = new EmbedBuilder()
                 .setTitle(antonymsLevelUp(title))
                 .setDescription(antonymsLevelUp(desc.replace(/\\n/g, '\n')))
                 .setColor(color)
                 .setTimestamp();
                 
             if (image) { embed.setImage(antonymsLevelUp(image)); }
             if (Number(mention) === 1) { levelUpContent = `${member}`; }
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
         if (permissionFlags && permissionFlags.has(PermissionsBitField.Flags.SendMessages) && permissionFlags.has(PermissionsBitField.Flags.ViewChannel)) {
             await channelToSend.send({ content: levelUpContent, embeds: [embed] }).catch(e => console.error(`[LevelUp Send Error]: ${e.message}`));
         }
    } catch (err) {
         console.error(`[LevelUp Error]: ${err.message}`);
    }
}

module.exports = {
    sendLevelUpMessage,
    getFreeBalance,
    calculateRequiredXP // 🔥 تم تصدير الدالة لتستخدمها باقي الملفات
};
