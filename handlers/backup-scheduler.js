const { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const https = require('https');
const Database = require('better-sqlite3'); 

const BACKUP_INTERVAL = 3 * 60 * 60 * 1000; // النسخ كل 3 ساعات
const OWNER_ID = "1145327691772481577";
const DB_PATH = path.join(process.cwd(), 'mainDB.sqlite');
const TEMP_PATH = path.join(process.cwd(), 'temp_restore.sqlite');

// ⚠️ ضع آيدي قناة الباكب هنا يدوياً لتجنب مشاكل قاعدة البيانات
const BACKUP_CHANNEL_ID_CONST = "123456789012345678"; // <--- تأكد من وضع آيدي القناة الصحيح هنا

module.exports = (client, sql) => {
    // 1. دالة النسخ الاحتياطي التلقائي (Backup Only - بدون استرجاع تلقائي)
    const performBackup = async () => {
        try {
            let backupChannelID = BACKUP_CHANNEL_ID_CONST;
            
            // محاولة جلب القناة من الإعدادات إذا لم يتم تحديدها بالأعلى
            if (!backupChannelID || backupChannelID === "123456789012345678") {
                try {
                    if (sql.open) {
                        const row = sql.prepare("SELECT shopLogChannelID FROM settings LIMIT 1").get();
                        if (row) backupChannelID = row.shopLogChannelID;
                    }
                } catch (e) {}
            }

            if (!backupChannelID || backupChannelID === "123456789012345678") return; 

            const channel = await client.channels.fetch(backupChannelID).catch(() => null);
            if (!channel) return;

            // إجبار الداتابيس على كتابة كل التغييرات المعلقة في ملف الـ WAL قبل أخذ النسخة
            if (sql.open) {
                try { sql.pragma('wal_checkpoint(TRUNCATE)'); } catch (e) {}
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

    // تشغيل النسخ التلقائي كل 3 ساعات فقط
    setInterval(performBackup, BACKUP_INTERVAL);

    // 2. معالج زر الاستعادة (Restore) - يعمل فقط عند ضغط الزر من قبل المالك
    client.on('interactionCreate', async interaction => {
        if (!interaction.isButton()) return;
        if (interaction.customId !== 'restore_backup') return;

        try {
            if (interaction.user.id !== OWNER_ID) {
                return interaction.reply({ content: "🚫 هذا الزر للمالك فقط.", flags: [MessageFlags.Ephemeral] });
            }

            // 🔥🔥 حماية من Unknown Interaction هنا 🔥🔥
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

            const message = interaction.message;
            const attachment = message.attachments.first();

            if (!attachment || !attachment.name.endsWith('.sqlite')) {
                return interaction.editReply({ content: "⚠️ لا يوجد ملف قاعدة بيانات صالح في هذه الرسالة." });
            }

            await interaction.editReply("⏳ **جاري تحميل النسخة واستبدال القاعدة... يرجى عدم إيقاف البوت!**");

            const file = fs.createWriteStream(TEMP_PATH);
            
            https.get(attachment.url, (response) => {
                response.pipe(file);
                file.on('finish', () => {
                    file.close(async () => {
                        try {
                            // إغلاق الاتصال الحالي بقاعدة البيانات بشكل آمن لمنع تعليق الملفات
                            if (sql.open) sql.close();

                            if (fs.existsSync(TEMP_PATH)) {
                                // حذف القاعدة الحالية وملفات الـ WAL والـ SHM الخاصة بها
                                const filesToRemove = [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`];
                                filesToRemove.forEach(f => {
                                    if (fs.existsSync(f)) {
                                        try { fs.unlinkSync(f); } catch(e){}
                                    }
                                });
                                
                                // استبدال الملف القديم بالنسخة المحملة
                                fs.renameSync(TEMP_PATH, DB_PATH);
                                console.log("🚨 [Backup Restore] Database replaced successfully by Owner!");
                                
                                await interaction.editReply("✅ **تمت الاستعادة بنجاح!**\n🔌 جاري إعادة التشغيل...");
                                
                                // إعادة تشغيل البوت لتطبيق النسخة الجديدة
                                setTimeout(() => process.exit(0), 2000);
                            }
                        } catch (err) {
                            console.error(err);
                            await interaction.editReply(`❌ **فشل الاستعادة:** ${err.message}`);
                            // محاولة إعادة فتح الاتصال بالقاعدة إذا فشلت الاستعادة
                            try { client.sql = new Database(DB_PATH); } catch(e){}
                        }
                    });
                });
            }).on('error', async (err) => {
                console.error(err);
                await interaction.editReply(`❌ **خطأ أثناء تحميل الملف:** ${err.message}`);
            });

        } catch (err) {
            console.error("[Restore Backup Interaction Error]", err);
        }
    });
};
