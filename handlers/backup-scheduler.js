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
const BACKUP_CHANNEL_ID_CONST = "123456789012345678"; // <--- ضع آيدي القناة هنا

module.exports = (client, sql) => {
    // 1. دالة النسخ الاحتياطي التلقائي
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

            if (!backupChannelID) return; 

            const channel = await client.channels.fetch(backupChannelID).catch(() => null);
            if (!channel) return;

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

    setInterval(performBackup, BACKUP_INTERVAL);

    // 2. معالج زر الاستعادة (Restore)
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

            await interaction.editReply("⏳ **جاري تحميل النسخة واستبدال القاعدة...**");

            const file = fs.createWriteStream(TEMP_PATH);
            
            https.get(attachment.url, (response) => {
                response.pipe(file);
                file.on('finish', () => {
                    file.close(async () => {
                        try {
                            if (sql.open) sql.close();

                            if (fs.existsSync(TEMP_PATH)) {
                                const filesToRemove = [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`];
                                filesToRemove.forEach(f => {
                                    if (fs.existsSync(f)) fs.unlinkSync(f);
                                });
                                
                                fs.renameSync(TEMP_PATH, DB_PATH);
                                console.log("[Backup Restore] Database replaced successfully.");
                                
                                await interaction.editReply("✅ **تمت الاستعادة بنجاح!**\n🔌 جاري إعادة التشغيل...");
                                
                                setTimeout(() => process.exit(0), 1000);
                            }
                        } catch (err) {
                            console.error(err);
                            await interaction.editReply(`❌ **فشل الاستعادة:** ${err.message}`);
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
