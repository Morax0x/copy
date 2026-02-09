const { EmbedBuilder, Colors } = require("discord.js");

module.exports = {
    name: 'afk',
    description: 'تفعيل وضع الغياب المؤقت',
    aliases: ['افك','اختفاء', 'مشغول'],

    async execute(message, args) {
        const client = message.client;
        const sql = client.sql;
        const guildId = message.guild.id;
        const userId = message.author.id;

        // 1. إنشاء الجدول إذا لم يوجد (مع خانة المشتركين والمنشنات)
        sql.prepare(`
            CREATE TABLE IF NOT EXISTS afk (
                userID TEXT,
                guildID TEXT,
                reason TEXT,
                timestamp INTEGER,
                mentionsCount INTEGER DEFAULT 0,
                subscribers TEXT DEFAULT '[]',
                PRIMARY KEY (userID, guildID)
            )
        `).run();

        // 2. السبب الافتراضي
        const reason = args.join(" ") || "مشغـول حالياً";
        const now = Math.floor(Date.now() / 1000);

        // 3. الحفظ في الداتابيس
        const stmt = sql.prepare("INSERT OR REPLACE INTO afk (userID, guildID, reason, timestamp, mentionsCount, subscribers) VALUES (?, ?, ?, ?, 0, '[]')");
        stmt.run(userId, guildId, reason, now);

        // 4. تغيير الاسم (إضافة [AFK])
        try {
            const oldName = message.member.displayName;
            if (!oldName.includes("[AFK]")) {
                await message.member.setNickname(`[AFK] ${oldName}`).catch(() => {});
            }
        } catch (e) {}

        // 5. رسالة التأكيد
        const embed = new EmbedBuilder()
            .setColor("Random") // لون عشوائي
            .setThumbnail(message.author.displayAvatarURL()) // صورة الشخص
            .setDescription(`💤 **✶ تم تفعيل وضع الغيـاب المؤقـت (AFK)**\n📝 **السبب:** ${reason}`);

        message.reply({ embeds: [embed] });
    }
};
