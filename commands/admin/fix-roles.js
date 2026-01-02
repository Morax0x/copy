const { PermissionsBitField } = require("discord.js");

module.exports = {
    name: "fixroles",
    description: "إصلاح رتب اللفلات لجميع الأعضاء (إزالة التراكم)",
    
    // 🔥 التعديل هنا: إزالة client من المدخلات وجلبه من message.client 🔥
    execute: async (message, args) => {
        const client = message.client; // تعريف العميل من الرسالة

        // 1. التحقق من الصلاحيات (للمالك أو الأدمن فقط)
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply("❌ هذا الأمر للمسؤولين فقط.");
        }

        const guild = message.guild;
        const statusMsg = await message.reply("🔄 جاري جلب البيانات والبدء في تنظيف الرتب... (قد يستغرق وقتاً لتجنب الحظر)");

        // 2. جلب جميع الأعضاء الذين لديهم لفلات في قاعدة البيانات لهذا السيرفر
        const allLevels = client.sql.prepare("SELECT * FROM levels WHERE guild = ?").all(guild.id);

        if (!allLevels || allLevels.length === 0) {
            return statusMsg.edit("⚠️ لا توجد بيانات لفلات مسجلة في هذا السيرفر.");
        }

        let processed = 0;
        let errors = 0;

        // 3. الدوران على كل عضو وتصحيح رتبته
        for (const data of allLevels) {
            try {
                // محاولة جلب العضو من الكاش أو الديسكورد
                const member = await guild.members.fetch(data.user).catch(() => null);

                if (member) {
                    // 🔥 هنا السحر: نستدعي نفس الدالة الموجودة في index.js
                    // هذه الدالة ستقوم بحساب اللفل وحذف القديم وإضافة الجديد
                    await client.checkAndAwardLevelRoles(member, data.level);
                    
                    processed++;
                }

                // 🛑 هام جداً: تأخير بسيط لتجنب Rate Limit من ديسكورد
                // إذا كان العدد كبيراً، البوت قد يتبند إذا لم نضع تأخير
                await new Promise(resolve => setTimeout(resolve, 1000)); // انتظار 1 ثانية بين كل عضو

                // تحديث الرسالة كل 10 أعضاء عشان تعرف التقدم
                if (processed % 10 === 0) {
                    await statusMsg.edit(`🔄 جاري العمل... تم فحص وتصحيح: ${processed} / ${allLevels.length} عضو.`);
                }

            } catch (err) {
                console.error(`[FixRoles Error] User: ${data.user} - ${err.message}`);
                errors++;
            }
        }

        // 4. الانتهاء
        await statusMsg.edit(`✅ **تم الانتهاء!**\n- تم فحص وتصحيح: ${processed} عضو.\n- أخطاء (أعضاء غادروا): ${errors}`);
    }
};
