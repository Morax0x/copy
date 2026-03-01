const { EmbedBuilder, PermissionsBitField } = require("discord.js");

// (الدوال المساعدة - لا تغيير)
function recalculateLevel(totalXP) {
    if (totalXP < 0) totalXP = 0;
    let level = 0;
    let xp = totalXP;
    let nextXP = 100;
    while (xp >= nextXP) {
        xp -= nextXP;
        level++;
        nextXP = 5 * (level ** 2) + (50 * level) + 100;
    }
    // (تصحيح بسيط هنا: اللفل يبدأ من 1 وليس 0)
    return { level: level + 1, xp: Math.floor(xp), totalXP: totalXP };
}

function calculateTotalXP(level) {
    // (تصحيح بسيط هنا: اللفل يبدأ من 1، لذا level - 1)
    if (level <= 1) return 0;
    let totalXP = 0;
    for (let i = 0; i < (level - 1); i++) {
        totalXP += (5 * (i ** 2) + (50 * i) + 100);
    }
    return totalXP;
}

module.exports = {
    name: 'add-level',
    aliases: ['give-level'],
    category: "Leveling",
    description: "Give or Add level to specified user",
    cooldown: 3,
    async execute(message, args) { // <-- تأكد من وجود async

        const user = message.mentions.members.first() || message.guild.members.cache.get(args[0]);

        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return message.reply(`You do not have permission to use this command!`);
        }

        const levelArgs = parseInt(args[1]);

        const getScore = message.client.getLevel;
        const setScore = message.client.setLevel;

        if (!user) {
            return message.reply(`Please mention an user!`)
        } else {
            if (isNaN(levelArgs) || levelArgs < 1) {
                return message.reply(`Please provide a valid number!`)
            } else {

                // --- ( ⬇️ تم تصحيح طريقة جلب البيانات هنا ⬇️ ) ---
                let score = getScore.get(user.id, message.guild.id);

                // دمج البيانات الافتراضية لضمان وجود كل الأعمدة
                // (يعمل هذا للمستخدمين الجدد والقدامى الذين ليس لديهم كل البيانات)
                score = { 
                    ...message.client.defaultData, 
                    ...score, 
                    user: user.id, 
                    guild: message.guild.id 
                };
                // --- ( ⬆️ نهاية التصحيح ⬆️ ) ---

                const newLevel = score.level + levelArgs;
                const newTotalXP = calculateTotalXP(newLevel);

                // (تبسيط الكود: لا حاجة لـ recalculate)
                score.level = newLevel;
                score.xp = 0; // (عند إضافة لفل، عادةً ما يتم تصفير الـ XP)
                score.totalXP = newTotalXP;

                let embed = new EmbedBuilder()
                    .setTitle(`Success!`)
                    .setDescription(`Successfully added ${levelArgs} level to ${user.toString()}! (New Level: ${newLevel})`)
                    .setColor("Random");

                // 1. حفظ البيانات في قاعدة البيانات أولاً
                setScore.run(score);

                // --- ( ⬇️ تمت إضافة دالة الرتب هنا ⬇️ ) ---
                // 2. استدعاء دالة الرتب يدوياً
                await message.client.checkAndAwardLevelRoles(user, newLevel);
                // --- ( ⬆️ نهاية الإضافة ⬆️ ) ---

                return message.channel.send({ embeds: [embed] });
            }
        }
    }
}