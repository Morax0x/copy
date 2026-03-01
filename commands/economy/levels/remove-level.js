const { EmbedBuilder, PermissionsBitField } = require("discord.js");
// const SQLite = require("better-sqlite3"); // <-- تم الحذف (غير مطلوب)
// const sql = new SQLite('./mainDB.sqlite'); // <-- تم الحذف (غير مطلوب)

// --- ( ⬇️ دوال حساب اللفل المصححة (تبدأ من لفل 1) ⬇️ ) ---
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
    return { level: level + 1, xp: Math.floor(xp), totalXP: totalXP };
}

function calculateTotalXP(level) {
    if (level <= 1) return 0;
    let totalXP = 0;
    for (let i = 0; i < (level - 1); i++) {
        totalXP += (5 * (i ** 2) + (50 * i) + 100);
    }
    return totalXP;
}
// --- ( ⬆️ نهاية الدوال المصححة ⬆️ ) ---


module.exports = {
    name: 'remove-level',
    aliases: ['removelevel'],
    category: "Leveling",
    description: "Remove or decrease level to specified user",
    cooldown: 3,
    async execute(message, args) { // <-- التأكد من وجود async

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
                return message.reply(`Please provide a valid number (1 or higher)!`)
            } else {

                // --- ( ⬇️ تم تصحيح طريقة جلب البيانات هنا ⬇️ ) ---
                let score = getScore.get(user.id, message.guild.id);

                score = {
                    ...message.client.defaultData,
                    ...score,
                    user: user.id,
                    guild: message.guild.id
                };
                // --- ( ⬆️ نهاية التصحيح ⬆️ ) ---

                if (score.level <= 1) {
                    return message.reply(`This user is already at level 1.`);
                }

                const oldLevel = score.level; // <-- حفظ اللفل القديم

                // (تحديد اللفل الجديد، والتأكد أن لا ينزل تحت 1)
                const newLevel = Math.max(1, score.level - levelArgs);

                const newTotalXP = calculateTotalXP(newLevel);
                const recalculated = recalculateLevel(newTotalXP); // (استخدام الدالة المصححة)

                score.level = recalculated.level;
                score.xp = recalculated.xp;
                score.totalXP = recalculated.totalXP;

                let embed = new EmbedBuilder()
                    .setTitle(`Success!`)
                    .setDescription(`Successfully removed ${levelArgs} level from ${user.toString()}! (New Level: ${score.level})`)
                    .setColor("Random");

                // 1. حفظ البيانات
                setScore.run(score);

                // --- ( ⬇️ تمت إضافة دالة الرتب هنا ⬇️ ) ---
                // 2. استدعاء دالة الرتب (فقط إذا تغير اللفل)
                if (score.level !== oldLevel) {
                     await message.client.checkAndAwardLevelRoles(user, score.level);
                }
                // --- ( ⬆️ نهاية الإضافة ⬆️ ) ---

                return message.channel.send({ embeds: [embed] });
            }
        }
    }
}