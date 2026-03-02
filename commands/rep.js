const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { generateRepCard } = require('../generators/rep-card-generator.js');

const OWNER_ID = "1145327691772481577";

const getRandomColor = () => Math.floor(Math.random() * 16777215);

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
    usage: 'rep <@user>',
    aliases: ['سمعة', 'reputation', 'سمعه', 'تزكية', 'تزكيه', 'شهادة'],

    async execute(message, args) {
        const sql = message.client.sql;
        const senderId = message.author.id;
        const guildId = message.guild.id;

        const targetMember = message.mentions.members.first();
        
        if (!targetMember || targetMember.user.bot) {
            const noMentionEmbed = new EmbedBuilder()
                .setDescription('منشـن الشخص الذي تريد تزكيـتـه ..؟')
                .setThumbnail('https://i.postimg.cc/02jPwF12/download.jpg')
                .setColor(getRandomColor());
            return message.reply({ embeds: [noMentionEmbed] });
        }

        const targetId = targetMember.id;

        if (targetId === senderId) {
            const selfEmbed = new EmbedBuilder()
                .setDescription('حـاول مجـددًا ولـكن منشن شخـص آخـر .. لا يمكنـك الشهـادة لنفسـك <:FBI:1439666820016508929>!')
                .setThumbnail('https://i.postimg.cc/qRnVwHM6/ayqwnt-(1).png')
                .setColor(getRandomColor());
            return message.reply({ embeds: [selfEmbed] });
        }

        const senderLevelData = sql.prepare("SELECT level FROM levels WHERE user = ? AND guild = ?").get(senderId, guildId);
        const senderLevel = senderLevelData ? senderLevelData.level : 1;

        if (senderId !== OWNER_ID && senderLevel < 10) {
            const lvlEmbed = new EmbedBuilder()
                .setTitle('✥ لا تسـتوفـي شـروط التزكيـة ..')
                .setDescription('✦ يجـب ان يـكـون مستـواك 10 عـلى الاقـل لتزكـي أحدهـم')
                .setThumbnail('https://i.postimg.cc/mrLwL056/ayqwnt-(3).png')
                .setColor(getRandomColor());
            return message.reply({ embeds: [lvlEmbed] });
        }

        const dbDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
        
        if (senderId !== OWNER_ID) {
            const dailyStatId = `${senderId}-${guildId}-${dbDateStr}`;
            const dailyStats = sql.prepare("SELECT messages FROM user_daily_stats WHERE id = ?").get(dailyStatId);
            const todayMessages = dailyStats ? (parseInt(dailyStats.messages) || 0) : 0;

            if (todayMessages < 20) {
                const msgEmbed = new EmbedBuilder()
                    .setTitle('✥ لا تسـتوفـي شـروط التزكيـة ..')
                    .setDescription('✦ يجـب ان تكـون متفـاعـل بالدردشـة لهـذا اليوم')
                    .setThumbnail('https://i.postimg.cc/mrLwL056/ayqwnt-(3).png')
                    .setColor(getRandomColor());
                return message.reply({ embeds: [msgEmbed] });
            }
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
            const cooldownEmbed = new EmbedBuilder()
                .setTitle('✥ استفـدت صـوتـك لهـذا اليـوم .. ⏳')
                .setDescription(`✦ يمـكنـك التـزكيـة مـجـددًا: <t:${nextRepTime}:R>`)
                .setThumbnail('https://i.postimg.cc/66YzP12B/ayqwnt-(2).png')
                .setColor(getRandomColor());
            return message.reply({ embeds: [cooldownEmbed] });
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
            const errorEmbed = new EmbedBuilder()
                .setDescription('✅ **تم منح السمعة بنجاح!**')
                .setColor(getRandomColor());
            message.reply({ embeds: [errorEmbed] });
        }
    }
};
