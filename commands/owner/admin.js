const { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const https = require('https');

// 🔒 ايدي المالك
const OWNER_ID = "1145327691772481577";

// 📂 تحديد المسارات
const rootDir = process.cwd();
const DB_PATH = path.join(rootDir, 'mainDB.sqlite');
const WAL_PATH = path.join(rootDir, 'mainDB.sqlite-wal');
const SHM_PATH = path.join(rootDir, 'mainDB.sqlite-shm');
const TEMP_PATH = path.join(rootDir, 'temp_upload.sqlite'); 

module.exports = {
    name: 'admin',
    aliases: ['do', 'up', 'sss'],
    description: 'أوامر إدارة قاعدة البيانات للمالك فقط',
    category: "Admin",

    async execute(message, args) {
        if (message.author.id !== OWNER_ID) return;

        const client = message.client;
        const prefix = args.prefix || "-";
        const commandName = message.content.split(" ")[0].slice(prefix.length).toLowerCase();

        // ============================================================
        // 📥 أمر UP: رفع واستبدال قاعدة البيانات
        // ============================================================
        if (commandName === 'up') {
            const attachment = message.attachments.first();
            
            if (!attachment) return message.reply("⚠️ **أرفق ملف قاعدة البيانات.**");
            if (!attachment.name.endsWith('.sqlite')) return message.reply("⚠️ **الملف يجب أن يكون بصيغة `.sqlite`**");

            const msg = await message.reply("⏳ **جاري التحميل...**");

            const file = fs.createWriteStream(TEMP_PATH);
            
            https.get(attachment.url, function(response) {
                response.pipe(file);

                file.on('finish', function() {
                    file.close(async () => {
                        try {
                            try {
                                if (client.sql && client.sql.open) {
                                    client.sql.close();
                                    console.log("[Database] Connection closed for update.");
                                }
                            } catch (e) { console.log("[Database] Already closed."); }

                            try { if (fs.existsSync(WAL_PATH)) fs.unlinkSync(WAL_PATH); } catch(e){}
                            try { if (fs.existsSync(SHM_PATH)) fs.unlinkSync(SHM_PATH); } catch(e){}
                            try { if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH); } catch(e){}

                            if (fs.existsSync(TEMP_PATH)) {
                                fs.renameSync(TEMP_PATH, DB_PATH);
                                console.log("[Database] Replaced successfully.");
                            }

                            await msg.edit("✅ **تم التحديث!**\n🔌 **جاري إعادة التشغيل...**");
                            
                            console.log("[System] Exiting process to force restart...");
                            setTimeout(() => { process.kill(process.pid); }, 1000);

                        } catch (err) {
                            console.error(err);
                            await msg.edit(`❌ **خطأ:** ${err.message}`);
                        }
                    });
                });
            }).on('error', function(err) {
                msg.edit(`❌ فشل التحميل: ${err.message}`);
            });
        }

        // ============================================================
        // 📤 أمر DO: تحميل نسخة (مع دعم 100MB لسيرفرات لفل 3)
        // ============================================================
        else if (commandName === 'do') {
            try {
                if (client.sql && client.sql.open) {
                    try { client.sql.pragma('wal_checkpoint(RESTART)'); } catch (e) {}
                }
                
                if (!fs.existsSync(DB_PATH)) return message.reply("⚠️ الملف غير موجود!");

                // حساب الحجم
                const stats = fs.statSync(DB_PATH);
                const fileSizeInBytes = stats.size;
                const fileSizeInMegabytes = fileSizeInBytes / (1024 * 1024);

                // 🔥 تم رفع الحد إلى 95MB لأن سيرفرك لفل 3 🔥
                if (fileSizeInMegabytes > 95) { 
                    return message.reply({ 
                        content: `❌ **حجم الملف ضخم جداً (${fileSizeInMegabytes.toFixed(2)} MB)!**\nتجاوز حتى حدود السيرفر (100MB).\n📂 **الحل:** حمله من الاستضافة.`
                    });
                }

                const attachment = new AttachmentBuilder(DB_PATH, { name: 'mainDB.sqlite' });
                
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('restore_backup')
                        .setLabel('استعادة هذه النسخة 🔄')
                        .setStyle(ButtonStyle.Danger)
                );

                try {
                    // محاولة الإرسال للخاص أولاً
                    await message.author.send({ 
                        content: `📦 **نسخة احتياطية** (${fileSizeInMegabytes.toFixed(2)} MB)\n📆 <t:${Math.floor(Date.now() / 1000)}:R>`, 
                        files: [attachment],
                        components: [row]
                    });
                    await message.react('✅');
                } catch (dmError) {
                    console.error("[Admin DO] DM Failed (likely size limit or closed DM):", dmError.message);
                    
                    // 🔥 الخطة البديلة: الإرسال في الشات (يستفيد من بوست السيرفر) 🔥
                    await message.reply({ 
                        content: `⚠️ **لم أستطع إرساله للخاص (قد يكون الملف كبيراً على الخاص)!**\n📦 إليك النسخة هنا (بفضل بوست السيرفر):`, 
                        files: [attachment],
                        components: [row] 
                    }).catch(e => {
                        message.reply(`❌ **فشل الإرسال في السيرفر أيضاً:** ${e.message}`);
                    });
                }

            } catch (err) { 
                console.error("[Admin DO] Error:", err);
                message.reply(`❌ خطأ عام: ${err.message}`); 
            }
        }
        
        // ============================================================
        // ⚙️ أمر SSS
        // ============================================================
        else if (commandName === 'sss') {
            const channel = message.mentions.channels.first() || message.channel;
            try {
                client.sql.prepare(`CREATE TABLE IF NOT EXISTS bot_config (key TEXT PRIMARY KEY, value TEXT)`).run();
                client.sql.prepare(`INSERT OR REPLACE INTO bot_config (key, value) VALUES (?, ?)`).run('backup_channel', channel.id);
                message.reply(`✅ تم تعيين قناة النسخ التلقائي: ${channel}`);
            } catch (err) { message.reply(`❌ خطأ: ${err.message}`); }
        }
    }
};
