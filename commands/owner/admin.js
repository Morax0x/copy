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
        // 📥 أمر UP: رفع واستبدال قاعدة البيانات (عبر مرفق في الشات)
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
                            // 1. محاولة إغلاق القاعدة
                            try {
                                if (client.sql && client.sql.open) {
                                    client.sql.close();
                                    console.log("[Database] Connection closed.");
                                }
                            } catch (e) { console.log("[Database] Already closed or error."); }

                            // 2. تنظيف الملفات القديمة
                            try { if (fs.existsSync(WAL_PATH)) fs.unlinkSync(WAL_PATH); } catch(e){}
                            try { if (fs.existsSync(SHM_PATH)) fs.unlinkSync(SHM_PATH); } catch(e){}
                            try { if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH); } catch(e){}

                            // 3. وضع الملف الجديد
                            if (fs.existsSync(TEMP_PATH)) {
                                fs.renameSync(TEMP_PATH, DB_PATH);
                                console.log("[Database] Replaced successfully.");
                            }

                            // 4. رسالة النهاية
                            await msg.edit("✅ **تم التحديث!**\n🔌 **جاري إعادة التشغيل تلقائياً... (انتظر دقيقة)**");

                            // 5. إعادة التشغيل
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
        // 📤 أمر DO: تحميل نسخة (مع زر الاستعادة)
        // ============================================================
        else if (commandName === 'do') {
            try {
                if (client.sql && client.sql.open) {
                    try { client.sql.pragma('wal_checkpoint(RESTART)'); } catch (e) {}
                }
                if (!fs.existsSync(DB_PATH)) return message.reply("⚠️ الملف غير موجود!");

                const attachment = new AttachmentBuilder(DB_PATH, { name: 'mainDB.sqlite' });
                
                // 🌟 إضافة زر الاستعادة 🌟
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('restore_backup') // نفس الآيدي الموجود في backup-scheduler
                        .setLabel('استعادة هذه النسخة 🔄')
                        .setStyle(ButtonStyle.Danger)
                );

                // 🔥🔥🔥 التعديل الجديد: محاولة الإرسال للخاص مع كشف الأخطاء 🔥🔥🔥
                try {
                    await message.author.send({ 
                        content: `📦 **نسخة احتياطية (يدوية)**\n📆 <t:${Math.floor(Date.now() / 1000)}:R>`, 
                        files: [attachment],
                        components: [row] // إرفاق الزر
                    });
                    await message.react('✅'); // تفاعل للنجاح
                } catch (dmError) {
                    console.error("[Admin DO] DM Failed:", dmError.message); // طباعة الخطأ في الكونسول
                    
                    // الخطة البديلة: الإرسال في الشات
                    await message.reply({ 
                        content: "⚠️ **تعذر الإرسال للخاص (الخاص مغلق أو البوت محظور).**\nإليك النسخة هنا:", 
                        files: [attachment],
                        components: [row] 
                    });
                }

            } catch (err) { 
                console.error("[Admin DO] Global Error:", err);
                message.reply(`❌ خطأ عام: ${err.message}`); 
            }
        }
        
        // ============================================================
        // ⚙️ أمر SSS (تعيين قناة الباكوب)
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
