const { EmbedBuilder, PermissionsBitField } = require("discord.js");
// const SQLite = require("better-sqlite3"); // <-- تم الحذف (غير مطلوب هنا)
// const sql = new SQLite('./mainDB.sqlite'); // <-- تم الحذف (غير مطلوب هنا)

// --- ( ⬇️ دالة حساب اللفل المصححة (تبدأ من لفل 1) ⬇️ ) ---
function recalculateLevel(totalXP) {
    if (totalXP < 0) totalXP = 0;
    let level = 0; // سيمثل (اللفل - 1)
    let xp = totalXP;
    let nextXP = 100; // XP للوصول من لفل 1 إلى 2
    while (xp >= nextXP) {
        xp -= nextXP;
        level++;
        // (اللفل هنا هو 1، 2، 3...)
        nextXP = 5 * (level ** 2) + (50 * level) + 100;
    }
    // (level + 1) لأننا نبدأ من لفل 1
    return { level: level + 1, xp: Math.floor(xp), totalXP: totalXP };
}
// --- ( ⬆️ نهاية الدالة المصححة ⬆️ ) ---

module.exports = {
    name: 'xp',
    aliases: ['exp', 'خبرة'],
    category: "Leveling",
    description: "يضيف أو يزيل XP من مستخدم.",
    async execute(message, args) { // <-- التأكد من وجود async

        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return message.reply(`ليس لديك صلاحية الإدارة!`);
        }

        const method = args[0] ? args[0].toLowerCase() : null;
        const user = message.mentions.members.first() || message.guild.members.cache.get(args[1]);
        const amount = parseInt(args[2]);

        if (!user || isNaN(amount) || amount <= 0 || (method !== 'add' && method !== 'remove')) {
            return message.reply("الاستخدام: `-xp <add/remove> <@user> <الكمية>`");
        }

        const getScore = message.client.getLevel;
        const setScore = message.client.setLevel;

        // --- ( ⬇️ تم تصحيح طريقة جلب البيانات هنا ⬇️ ) ---
        let score = getScore.get(user.id, message.guild.id);

        // دمج البيانات الافتراضية لضمان وجود كل الأعمدة
        score = {
            ...message.client.defaultData,
            ...score,
            user: user.id,
            guild: message.guild.id
        };
        // --- ( ⬆️ نهاية التصحيح ⬆️ ) ---

        // (نقل التحقق إلى ما بعد جلب البيانات ليكون أدق)
        if (method === 'remove' && score.totalXP === 0) {
            return message.reply("هذا المستخدم ليس لديه XP أصلاً.");
        }

        let newTotalXP;
        if (method === 'add') {
            newTotalXP = score.totalXP + amount;
        } else {
            newTotalXP = score.totalXP - amount;
            if (newTotalXP < 0) newTotalXP = 0;
        }

        const oldLevel = score.level; // <-- حفظ اللفل القديم للمقارنة
        const newScore = recalculateLevel(newTotalXP); // <-- استخدام الدالة المصححة

        score.totalXP = newScore.totalXP;
        score.level = newScore.level;
        score.xp = newScore.xp;

        // 1. حفظ البيانات في قاعدة البيانات
        setScore.run(score);

        // --- ( ⬇️ تمت إضافة دالة الرتب هنا ⬇️ ) ---
        // 2. التحقق من الرتب (فقط إذا تغير اللفل)
        if (score.level !== oldLevel) {
            await message.client.checkAndAwardLevelRoles(user, score.level);
            console.log(`[Level Roles] تم تشغيل التحقق من الرتب لـ ${user.user.tag} (تغير اللفل من ${oldLevel} إلى ${score.level})`);
        }
        // --- ( ⬆️ نهاية الإضافة ⬆️ ) ---


        // (تحسينات على رسائل الرد)
        if (method === 'add') {
            let embed = new EmbedBuilder()
                .setTitle(`✅ تمت إضافة الخبرة!`)
                .setDescription(`تمت إضافة ${amount} XP إلى ${user.toString()}.\n\n**المستوى:** ${score.level}\n**الخبرة:** ${score.xp}`)
                .setColor("Green");

            if (score.level > oldLevel) {
                embed.setDescription(`تمت إضافة ${amount} XP إلى ${user.toString()}.\n**🎉 لقد ارتفع مستواه!**\n\n**المستوى الجديد:** ${score.level}\n**الخبرة:** ${score.xp}`);
            }
            return message.channel.send({ embeds: [embed] });

        } else { // (method === 'remove')
            let embed = new EmbedBuilder()
                .setTitle(`🗑️ تمت إزالة الخبرة!`)
                .setDescription(`تمت إزالة ${amount} XP من ${user.toString()}.\n\n**المستوى:** ${score.level}\n**الخبرة:** ${score.xp}`)
                .setColor("Red");

            if (score.level < oldLevel) {
                embed.setDescription(`تمت إزالة ${amount} XP من ${user.toString()}.\n**📉 لقد انخفض مستواه!**\n\n**المستوى الجديد:** ${score.level}\n**الخبرة:** ${score.xp}`);
            }
            return message.channel.send({ embeds: [embed] });
        }
    }
}