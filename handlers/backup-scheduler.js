const { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const https = require('https');

const BACKUP_INTERVAL = 3 * 60 * 60 * 1000; // النسخ كل 3 ساعات
const OWNER_ID = "1145327691772481577";
const DB_PATH = path.join(process.cwd(), 'mainDB.sqlite');
const TEMP_PATH = path.join(process.cwd(), 'temp_restore.sqlite');

module.exports = (client, sql) => {
    // 1. دالة النسخ الاحتياطي التلقائي
    const performBackup = async () => {
        try {
            let backupChannelID = null;
            try {
                // جلب قناة النسخ الاحتياطي من جدول الإعدادات
                const row = sql.prepare("SELECT value FROM bot_config WHERE key = 'backup_channel'").get();
                if (row) backupChannelID = row.value;
            } catch (e) {}

            if (!backupChannelID) return;

            const channel = await client.channels.fetch(backupChannelID).catch(() => null);
            if (!channel) return;

            //checkpoint لضمان كتابة كافة البيانات من الـ WAL إلى الملف الرئيسي قبل النسخ
            if (sql.open) {
                try { sql.pragma('wal_checkpoint(RESTART)'); } catch (e) {}
            }
            
            if (!fs.existsSync(DB_PATH)) return;

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

    // تشغيل المؤقت للنسخ الاحتياطي
    setInterval(performBackup, BACKUP_INTERVAL);

    // 2. معالج زر الاستعادة (Restore)
    client.on('interactionCreate', async interaction => {
        if (!interaction.isButton()) return;
        if (interaction.customId !== 'restore_backup') return;

        // التحقق من هوية المالك
        if (interaction.user.id !== OWNER_ID) {
            return interaction.reply({ content: "🚫 هذا الزر للمالك فقط.", ephemeral: true });
        }

        const message = interaction.message;
        const attachment = message.attachments.first();

        if (!attachment || !attachment.name.endsWith('.sqlite')) {
            return interaction.reply({ content: "⚠️ لا يوجد ملف قاعدة بيانات صالح في هذه الرسالة.", ephemeral: true });
        }

        // استخدام deferReply لتجنب خطأ Unknown Interaction (10062)
        await interaction.deferReply({ ephemeral: true });
        await interaction.editReply("⏳ **جاري تحميل النسخة واستبدال القاعدة...**");

        const file = fs.createWriteStream(TEMP_PATH);
        
        https.get(attachment.url, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close(async () => {
                    try {
                        // إغلاق اتصال قاعدة البيانات الحالي قبل التبديل
                        if (sql.open) sql.close();

                        // استبدال الملفات
                        if (fs.existsSync(TEMP_PATH)) {
                            // حذف الملف الرئيسي وملفات الـ WAL/SHM المؤقتة
                            const filesToRemove = [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`];
                            filesToRemove.forEach(f => {
                                if (fs.existsSync(f)) fs.unlinkSync(f);
                            });
                            
                            // إعادة تسمية الملف الجديد ليصبح هو القاعدة الأساسية
                            fs.renameSync(TEMP_PATH, DB_PATH);
                            console.log("[Backup Restore] Database replaced successfully.");
                            
                            await interaction.editReply("✅ **تمت الاستعادة بنجاح!**\n🔌 جاري إعادة التشغيل...");
                            
                            // إغلاق العملية ليقوم نظام التشغيل (مثل PM2 أو Docker) بإعادة التشغيل تلقائياً
                            setTimeout(() => process.exit(0), 1000);
                        }
                    } catch (err) {
                        console.error(err);
                        await interaction.editReply(`❌ **فشل الاستعادة:** ${err.message}`);
                    }
                });
            });
        }).on('error', async (err) => {
            console.error(err);
            await interaction.editReply(`❌ **خطأ أثناء تحميل الملف:** ${err.message}`);
        });
    });
};
