const { EmbedBuilder, Colors } = require("discord.js");

// خريطة لتخزين الكولداون (خارج الدالة لضمان الحفظ المؤقت)
const cooldowns = new Map();

module.exports = {
    name: 'afk',
    description: 'تفعيل وضع الغياب المؤقت',
    aliases: ['افك', 'غياب', 'مشغول'],

    async execute(message, args) {
        const userId = message.author.id;
        const now = Date.now();
        const cooldownAmount = 10 * 60 * 1000; // 10 دقائق بالمللي ثانية

        // 1. التحقق من الكولداون
        if (cooldowns.has(userId)) {
            const expirationTime = cooldowns.get(userId);
            
            if (now < expirationTime) {
                const expiredTimestamp = Math.floor(expirationTime / 1000); // تحويل لثواني عشان ديسكورد
                
                const cooldownEmbed = new EmbedBuilder()
                    .setColor(Colors.Red)
                    .setDescription(`✶ غـبـت منـذ قليل .. انتظـر <t:${expiredTimestamp}:R> للتـأفيـك مجـددًا <:stop:1436337453098340442>`);

                // إرسال الرد وحذفه بعد 5 ثواني
                return message.reply({ embeds: [cooldownEmbed] }).then(msg => {
                    setTimeout(() => msg.delete().catch(() => {}), 5000);
                });
            }
        }

        // تسجيل الكولداون الجديد للمستخدم
        cooldowns.set(userId, now + cooldownAmount);
        // حذف الكولداون من الذاكرة بعد انتهاء الوقت لتخفيف الحمل
        setTimeout(() => cooldowns.delete(userId), cooldownAmount);

        // --- باقي الكود الأصلي ---
        const client = message.client;
        const sql = client.sql;
        const guildId = message.guild.id;

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
        // const now = Math.floor(Date.now() / 1000); // (تم تعريف now بالأعلى)
        const timestamp = Math.floor(now / 1000);

        // 3. الحفظ في الداتابيس
        const stmt = sql.prepare("INSERT OR REPLACE INTO afk (userID, guildID, reason, timestamp, mentionsCount, subscribers, messages) VALUES (?, ?, ?, ?, 0, '[]', '[]')");
        stmt.run(userId, guildId, reason, timestamp);

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

        // إرسال الرسالة وحذفها بعد 20 ثانية (حسب كودك الأصلي)
        message.reply({ embeds: [embed] }).then(msg => {
            setTimeout(() => msg.delete().catch(() => {}), 20000);
        });
    }
};
