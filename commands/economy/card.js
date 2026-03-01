// commands/economy/card.js

const { AttachmentBuilder } = require('discord.js');
const { generateAdventurerCard } = require('../../generators/adventurer-card-generator.js');

// 🎨 ألوان الرتب الفخمة الجديدة (تم تعديل E و F لتقليل التشابه)
function getRepRankInfo(points) {
    if (points >= 1000) return { name: '👑 رتبـة SS', color: '#FF0055' }; // أحمر قرمزي نيون (Mythic)
    if (points >= 500)  return { name: '💎 رتبـة S', color: '#9D00FF' }; // بنفسجي ملكي (Legendary)
    if (points >= 250)  return { name: '🥇 رتبـة A', color: '#FFD700' }; // ذهبي ساطع (Epic)
    if (points >= 100)  return { name: '🥈 رتبـة B', color: '#00FF88' }; // زمردي مضيء (Rare)
    if (points >= 50)   return { name: '🥉 رتبـة C', color: '#00BFFF' }; // أزرق سماوي (Uncommon)
    if (points >= 25)   return { name: '⚔️ رتبـة D', color: '#A9A9A9' }; // فضي فولاذي (Steel)
    if (points >= 10)   return { name: '🛡️ رتبـة E', color: '#B87333' }; // نحاسي لامع (Copper) - مختلف عن البني
    return { name: '🪵 رتبـة F', color: '#654321' }; // بني ترابي داكن (Dark Earth)
}

module.exports = {
    name: 'card',
    aliases: ['بطاقة', 'كارد'],
    category: "Economy",
    cooldown: 5,
    description: 'عرض بطاقة المغامر الخاصة بك والتي تحتوي على الثروة، المستوى، والسمعة.',
    usage: '-card [user]',
    
    async execute(message, args) {
        const client = message.client;
        const guild = message.guild;
        const sql = client.sql;
        
        // تحديد المستخدم (الشخص نفسه أو شخص منشنه)
        let targetUser = message.mentions.users.first() || message.author;
        
        // جلب بالآيدي إذا وجد
        if (args[0] && !message.mentions.users.first()) {
            try {
                targetUser = await client.users.fetch(args[0]);
            } catch (e) {
                targetUser = message.author;
            }
        }

        if (targetUser.bot) {
            return message.reply("❌ البوتات لا تمتلك بطاقات مغامر!");
        }

        const userId = targetUser.id;
        const guildId = guild.id;

        try {
            // جلب بيانات اللفل والمورا
            let levelData = { level: 1, mora: 0 };
            if (client.getLevel) {
                levelData = client.getLevel.get(userId, guildId) || levelData;
            } else {
                levelData = sql.prepare("SELECT level, mora FROM levels WHERE user = ? AND guild = ?").get(userId, guildId) || levelData;
            }

            // جلب بيانات السمعة
            const repData = sql.prepare("SELECT rep_points FROM user_reputation WHERE userID = ? AND guildID = ?").get(userId, guildId) || { rep_points: 0 };
            const points = repData.rep_points;
            const rankInfo = getRepRankInfo(points);

            // توليد الصورة من الـ Generator مباشرة
            const buffer = await generateAdventurerCard(targetUser, rankInfo, points, levelData.level, levelData.mora);
            const attachment = new AttachmentBuilder(buffer, { name: 'adventurer_card.png' });

            // إرسال الصورة فوراً
            await message.reply({ content: `<@${targetUser.id}> بطاقة المغامر:`, files: [attachment] });

        } catch (error) {
            console.error("Error in card command:", error);
            await message.reply("❌ حدث خطأ أثناء محاولة رسم البطاقة.");
        }
    }
};
