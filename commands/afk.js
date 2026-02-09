const { EmbedBuilder, Colors } = require("discord.js");

module.exports = {
    name: 'afk',
    description: 'تفعيل وضع الغياب المؤقت',
    aliases: ['افك', 'اختفاء', 'مشغول'],

    async execute(message, args) {
        const client = message.client;
        const sql = client.sql;
        const guildId = message.guild.id;
        const userId = message.author.id;

        // 1. إنشاء الجدول إذا لم يوجد
        sql.prepare(`
            CREATE TABLE IF NOT EXISTS afk (
                userID TEXT,
                guildID TEXT,
                reason TEXT,
                timestamp INTEGER,
                mentionsCount INTEGER DEFAULT 0,
                subscribers TEXT DEFAULT '[]',
                messages TEXT DEFAULT '[]',
                PRIMARY KEY (userID, guildID)
            )
        `).run();

        // ⚠️ خطوة احترازية: إضافة الأعمدة الناقصة إن وجدت
        try {
            sql.prepare("ALTER TABLE afk ADD COLUMN messages TEXT DEFAULT '[]'").run();
        } catch (e) {}

        // 2. السبب الافتراضي
        const reason = args.join(" ") || "مشغـول حالياً";
        const now = Math.floor(Date.now() / 1000);

        // 3. الحفظ في الداتابيس
        const stmt = sql.prepare("INSERT OR REPLACE INTO afk (userID, guildID, reason, timestamp, mentionsCount, subscribers, messages) VALUES (?, ?, ?, ?, 0, '[]', '[]')");
        stmt.run(userId, guildId, reason, now);

        // 4. تغيير الاسم (إضافة [AFK])
        try {
            const oldName = message.member.displayName;
            if (!oldName.includes("[AFK]")) {
                const newName = `[AFK] ${oldName}`.substring(0, 32);
                await message.member.setNickname(newName).catch(() => {});
            }
        } catch (e) {}

        // 5. رسالة التأكيد (بالتنسيق الجديد)
        const embed = new EmbedBuilder()
            .setColor("Random")
            .setTitle('✶ غـيـاب مؤقـت')
            .setThumbnail(message.author.displayAvatarURL())
            .setDescription(`💤 **تم تفعيل وضع الغيـاب المؤقـت بنجاح**\n\n📝 **السبب:** ${reason}`);

        // إرسال الرسالة وحذفها بعد 20 ثانية
        message.reply({ embeds: [embed] }).then(msg => {
            setTimeout(() => msg.delete().catch(() => {}), 20000);
        });
    }
};
