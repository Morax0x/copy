const { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const https = require('https');
const Database = require('better-sqlite3'); // نحتاج هذا لإعادة الاتصال إذا فشل الريستارت

const BACKUP_INTERVAL = 3 * 60 * 60 * 1000; // 3 ساعات
const OWNER_ID = "1145327691772481577"; // آيديك
const DB_PATH = path.join(process.cwd(), 'mainDB.sqlite');
const TEMP_PATH = path.join(process.cwd(), 'temp_restore.sqlite');

module.exports = (client, sql) => {

    // 1. دالة النسخ الاحتياطي
    const performBackup = async () => {
        try {
            // التحقق من وجود ملف القاعدة
            if (!fs.existsSync(DB_PATH)) return;

            // جلب قناة النسخ من جدول settings (المعتمد في بوتك)
            // تأكد أنك أضفت عمود shopLogChannelID أو قم بإنشاء عمود جديد اسمه backupChannelID
            // سأفترض هنا أنك ستضيف عمود backupChannelID لجدول settings لاحقاً
            // أو يمكنك وضع الآيدي مباشرة هنا مؤقتاً للتجربة
            
            let backupChannelID = null;
            try {
                // محاولة جلب القناة من الإعدادات
                const settings = sql.prepare("SELECT backupChannelID FROM settings LIMIT 1").get();
                if (settings) backupChannelID = settings.backupChannelID;
            } catch (e) {
                // إذا العمود غير موجود، تجاهل الخطأ
            }

            // إذا لم يتم تحديد قناة، لا تقم بالنسخ
            if (!backupChannelID) return; 

            const channel = await client.channels.fetch(backupChannelID).catch(() => null);
            if (!channel) return;

            // حفظ البيانات المعلقة (Checkpoint)
            if (sql.open) {
                try { sql.pragma('wal_checkpoint(RESTART)'); } catch (e) {}
            }
            
            const attachment = new AttachmentBuilder(DB_PATH, { name: 'mainDB.sqlite' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('restore_backup')
                    .setLabel('استعادة هذه النسخة 🔄')
                    .setStyle(ButtonStyle.Danger)
            );

            await channel.send({ 
                content: `📦 **نسخة احتياطية تلقائية**\n⏰ <t:${Math.floor(Date.now() / 1000)}:R>`, 
                files: [attachment],
                components: [row]
            });

        } catch (err) { console.error("[Backup] Error:", err); }
    };

    // تشغيل المؤقت
    setInterval(performBackup, BACKUP_INTERVAL);

    // 2. معالج زر الاستعادة
    client.on('interactionCreate', async interaction => {
        if (!interaction.isButton()) return;
        if (interaction.customId !== 'restore_backup') return;

        // التحقق من المالك
        if (interaction.user.id !== OWNER_ID) {
            return interaction.reply({ content: "🚫 هذا الزر للمالك فقط.", flags: [MessageFlags.Ephemeral] });
        }

        const message = interaction.message;
        const attachment = message.attachments.first();

        if (!attachment || !attachment.name.endsWith('.sqlite')) {
            return interaction.reply({ content: "⚠️ لا يوجد ملف قاعدة بيانات صالح.", flags: [MessageFlags.Ephemeral] });
        }

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        
        // التحقق من أن الرابط صالح
        if (!attachment.url) {
            return interaction.editReply("❌ رابط الملف غير صالح.");
        }

        await interaction.editReply("⏳ **جاري تحميل النسخة...**");

        const file = fs.createWriteStream(TEMP_PATH);
        
        https.get(attachment.url, (response) => {
            if (response.statusCode !== 200) {
                return interaction.editReply("❌ فشل تحميل الملف من ديسكورد.");
            }

            response.pipe(file);

            file.on('finish', async () => {
                file.close(); // إغلاق ملف التحميل

                try {
                    await interaction.editReply("⏳ **جاري استبدال قاعدة البيانات...**");

                    // 1. إغلاق الاتصال الحالي
                    if (client.sql && client.sql.open) {
                        client.sql.close();
                    }

                    // 2. حذف الملفات القديمة
                    if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
                    if (fs.existsSync(`${DB_PATH}-wal`)) fs.unlinkSync(`${DB_PATH}-wal`);
                    if (fs.existsSync(`${DB_PATH}-shm`)) fs.unlinkSync(`${DB_PATH}-shm`);

                    // 3. وضع الملف الجديد
                    fs.renameSync(TEMP_PATH, DB_PATH);

                    console.log("[Backup] Database restored.");

                    await interaction.editReply("✅ **تمت الاستعادة!**\n🔌 سيتم إعادة التشغيل الآن...");

                    // 4. الخروج لإعادة التشغيل (يتطلب PM2)
                    setTimeout(() => process.exit(0), 1000);

                } catch (err) {
                    console.error(err);
                    // محاولة الطوارئ: إعادة فتح القاعدة القديمة إذا فشل الاستبدال
                    try { client.sql = new Database(DB_PATH); } catch(e) {}
                    await interaction.editReply(`❌ **حدث خطأ فادح:** ${err.message}`);
                }
            });
        }).on('error', async (err) => {
            fs.unlink(TEMP_PATH, () => {}); // تنظيف الملف المؤقت
            await interaction.editReply(`❌ **خطأ في الشبكة:** ${err.message}`);
        });
    });
};
