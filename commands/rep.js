const { AttachmentBuilder, MessageFlags } = require('discord.js');
const { generateRepCard } = require('../generators/rep-card-generator.js');

const OWNER_ID = "1145327691772481577";

function getRepRank(points) {
    if (points >= 1000) return { rank: 'SS', name: '👑 مغامـر رتبـة SS', color: '#FF00FF', next: 'الحد الأقصى' };
    if (points >= 500)  return { rank: 'S',  name: '💎 مغامـر رتبـة S', color: '#00FFFF', next: 1000 };
    if (points >= 250)  return { rank: 'A',  name: '🥇 مغامـر رتبـة A', color: '#FFD700', next: 500 };
    if (points >= 100)  return { rank: 'B',  name: '🥈 مغامـر رتبـة B', color: '#C0C0C0', next: 250 };
    if (points >= 50)   return { rank: 'C',  name: '🥉 مغامـر رتبـة C', color: '#CD7F32', next: 100 };
    if (points >= 25)   return { rank: 'D',  name: '⚔️ مغامـر رتبـة D', color: '#2E8B57', next: 50 };
    if (points >= 10)   return { rank: 'E',  name: '🛡️ مغامـر رتبـة E', color: '#8B4513', next: 25 };
    return { rank: 'F', name: '🪵 مغامـر رتبـة F', color: '#A0522D', next: 10 };
}

function getNextResetTime() {
    const now = new Date();
    const options = { timeZone: 'Asia/Riyadh', year: 'numeric', month: 'numeric', day: 'numeric' };
    const rsaDateString = now.toLocaleDateString('en-US', options);
    const resetDate = new Date(rsaDateString + ' 23:59:59 GMT+0300'); 
    
    if (resetDate.getTime() < now.getTime()) {
        resetDate.setDate(resetDate.getDate() + 1);
    }
    
    return Math.floor(resetDate.getTime() / 1000);
}

module.exports = {
    name: 'rep',
    description: 'منح نقطة سمعة لمغامر آخر',
    usage: '-rep <@user>',
    aliases: ['سمعة', 'reputation', 'سمعه', 'تزكية', 'تزكيه', 'شهادة'],

    async execute(message, args) {
        const sql = message.client.sql;
        const senderId = message.author.id;
        const guildId = message.guild.id;

        const targetMember = message.mentions.members.first();
        if (!targetMember) {
            return message.reply("❌ **يجب عليك منشنة الشخص الذي تريد منحه السمعة!**\nمثال: `-rep @user`");
        }

        const targetId = targetMember.id;

        if (targetMember.user.bot) {
            return message.reply("🤖 **لا يمكنك منح السمعة للبوتات!**");
        }

        if (targetId === senderId) {
            return message.reply("🚫 **لا يمكنك منح السمعة لنفسك!** ابحث عن شخص يستحقها.");
        }

        const senderLevelData = sql.prepare("SELECT level FROM levels WHERE user = ? AND guild = ?").get(senderId, guildId);
        const senderLevel = senderLevelData ? senderLevelData.level : 1;

        if (senderId !== OWNER_ID && senderLevel < 10) {
            return message.reply(`🔒 **صوتك ليس مسموعاً في النقابة بعد!**\nيجب أن تصل إلى **المستوى 10** لكي تتمكن من منح نقاط السمعة للآخرين. (مستواك الحالي: ${senderLevel})`);
        }

        let senderRep = sql.prepare("SELECT * FROM user_reputation WHERE userID = ? AND guildID = ?").get(senderId, guildId);
        if (!senderRep) {
            sql.prepare("INSERT INTO user_reputation (userID, guildID) VALUES (?, ?)").run(senderId, guildId);
            senderRep = sql.prepare("SELECT * FROM user_reputation WHERE userID = ? AND guildID = ?").get(senderId, guildId);
        }

        let targetRep = sql.prepare("SELECT * FROM user_reputation WHERE userID = ? AND guildID = ?").get(targetId, guildId);
        if (!targetRep) {
            sql.prepare("INSERT INTO user_reputation (userID, guildID) VALUES (?, ?)").run(targetId, guildId);
            targetRep = sql.prepare("SELECT * FROM user_reputation WHERE userID = ? AND guildID = ?").get(targetId, guildId);
        }

        const todayDateStr = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Riyadh' });
        
        if (senderId !== OWNER_ID && senderRep.last_rep_given === todayDateStr) {
            const nextRepTime = getNextResetTime();
            return message.reply(`⏳ **لقد استنفدت صوتك لهذا اليوم!**\nيـمكنـك منح شهـادتك مجـددًا: <t:${nextRepTime}:R>.`);
        }

        const newTargetPoints = targetRep.rep_points + 1;
        
        sql.transaction(() => {
            sql.prepare("UPDATE user_reputation SET rep_points = rep_points + 1 WHERE userID = ? AND guildID = ?").run(targetId, guildId);
            sql.prepare("UPDATE user_reputation SET last_rep_given = ?, weekly_reps_given = weekly_reps_given + 1 WHERE userID = ? AND guildID = ?").run(todayDateStr, senderId, guildId);
        })();

        const targetRankData = getRepRank(newTargetPoints);
        const oldRankData = getRepRank(targetRep.rep_points);
        const isRankUp = targetRankData.rank !== oldRankData.rank;

        message.channel.sendTyping();

        try {
            const senderAvatar = message.author.displayAvatarURL({ extension: 'png', size: 128 });
            const receiverAvatar = targetMember.user.displayAvatarURL({ extension: 'png', size: 256 });
            const receiverName = targetMember.displayName || targetMember.user.username;

            const imageBuffer = await generateRepCard(senderAvatar, receiverAvatar, receiverName, newTargetPoints, targetRankData, isRankUp);
            const attachment = new AttachmentBuilder(imageBuffer, { name: 'reputation.png' });

            await message.reply({ content: `<@${targetId}>`, files: [attachment] });
            
        } catch (error) {
            console.error("Error generating rep card:", error);
            message.reply("✅ **تم منح السمعة بنجاح!** (حدث خطأ أثناء رسم الشهادة).");
        }
    }
};
