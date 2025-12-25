const { EmbedBuilder, PermissionsBitField } = require("discord.js");

module.exports = {
    name: 'setlevelmessage',
    aliases: ['setlvlmsg'],
    category: "Leveling",
    description: "تخصيص رسالة التلفيل.",
    cooldown: 5,
    async execute(message, args) {

        const sql = message.client.sql; 

        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return message.reply(`❌ ليس لديك صلاحيات لاستخدام هذا الأمر!`);
        }

        const subCommand = args[0] ? args[0].toLowerCase() : null;
        const guildId = message.guild.id;

        // تجهيز الجمل للاستعلام
        const setStmt = sql.prepare("INSERT OR REPLACE INTO settings (guild, lvlUpTitle, lvlUpDesc, lvlUpImage, lvlUpColor, lvlUpMention) VALUES (@guild, @lvlUpTitle, @lvlUpDesc, @lvlUpImage, @lvlUpColor, @lvlUpMention);");
        const getStmt = sql.prepare("SELECT * FROM settings WHERE guild = ?");

        let settings = getStmt.get(guildId);
        if (!settings) {
            sql.prepare("INSERT INTO settings (guild) VALUES (?)").run(guildId);
            settings = getStmt.get(guildId);
        }

        // قائمة المساعدة
        if (!subCommand) {
            const embed = new EmbedBuilder()
                .setTitle("⚙️ إعدادات رسالة التلفيل")
                .setColor("Blue")
                .setDescription("استخدم الأوامر الفرعية التالية لتخصيص الرسالة:\n\n" +
                    "`setlevelmessage empire` - تفعيل نمط الإمبراطورية (النص الفخم).\n" +
                    "`setlevelmessage desc <text>` - كتابة رسالة خاصة بك (استخدم `\\n` للسطر الجديد).\n" +
                    "`setlevelmessage show` - عرض الرسالة الحالية.\n" +
                    "`setlevelmessage reset` - إعادة التعيين للوضع الافتراضي.");
            return message.channel.send({ embeds: [embed] });
        }

        // ✅ خيار الإمبراطورية (النص الجديد)
        if (subCommand === 'empire') {
            // النص الفخم مع الإيموجيات الجديدة
            const desc = "╭⭒★︰ <a:wi:1435572304988868769> {member} <a:wii:1435572329039007889>\\n" +
                         "✶ مبارك صعودك في سُلّم الإمبراطورية\\n" +
                         "★ فقد كـسرت حـاجـز الـمستوى〃{level_old}〃وبلغـت المسـتـوى الـ 〃{level}〃 <a:MugiStronk:1438795606872166462> وتعاظم شأنك بين جموع الرعية فامضِ قُدمًا نحو المجد <:2KazumaSalut:1437129108806176768>";
            
            // إلغاء العناوين والصور القديمة لأن النظام الجديد يعتمد على الكانفاس والنص فقط
            settings.lvlUpTitle = null;
            settings.lvlUpDesc = desc;
            settings.lvlUpImage = null; 
            settings.lvlUpColor = null;
            settings.lvlUpMention = 1;

            setStmt.run(settings);
            return message.reply("✅ **تم تفعيل نمط الإمبراطورية!** ستظهر الرسالة الفخمة مع بطاقة التلفيل.");
        }

        // تخصيص النص يدوياً
        if (subCommand === 'desc' || subCommand === 'text') {
            const text = args.slice(1).join(' ');
            if (!text) return message.reply("الرجاء كتابة النص المطلوب. استخدم `\\n` للنزول سطر جديد.");
            
            settings.lvlUpDesc = text;
            // تصفير العنوان والصورة لضمان عدم التعارض
            settings.lvlUpTitle = null;
            settings.lvlUpImage = null;
            
            setStmt.run(settings);
            return message.reply(`✅ تم تحديث نص رسالة التلفيل.`);
        }

        // إعادة التعيين
        if (subCommand === 'reset') {
            settings.lvlUpTitle = null;
            settings.lvlUpDesc = null; // سيجعل البوت يستخدم النص الافتراضي في الكود
            settings.lvlUpImage = null;
            settings.lvlUpColor = null;
            settings.lvlUpMention = 1;
            setStmt.run(settings);
            return message.reply("🔄 تم إعادة تعيين الرسالة للوضع الافتراضي.");
        }

        // عرض الشكل الحالي
        if (subCommand === 'show') {
            const msgContent = settings.lvlUpDesc || "الرسالة الافتراضية للنظام.";

            const member = message.member;
            const level = 10;
            const level_old = 9;

            // دالة استبدال المتغيرات للعرض
            function formatMsg(string) {
                if (!string) return "";
                return string
                    .replace(/{member}/gi, `${member}`)
                    .replace(/{level}/gi, `${level}`)
                    .replace(/{level_old}/gi, `${level_old}`)
                    .replace(/\\n/g, '\n');
            }

            const content = formatMsg(msgContent);

            return message.channel.send({ 
                content: `**معاينة النص الحالي (بدون الصورة):**\n\n${content}`,
                allowedMentions: { parsed: [] } // منع المنشن الوهمي
            });
        }
    }
};
