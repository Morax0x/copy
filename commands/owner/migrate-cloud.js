const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const Database = require('better-sqlite3');

const OWNER_ID = "1145327691772481577";

module.exports = {
    name: 'migrate-cloud',
    aliases: ['mc', 'هجرة'],
    category: "Owner",
    async execute(message, args) {
        if (message.author.id !== OWNER_ID) return;

        const db = message.client.sql;
        if (!db) return message.reply("❌ البوت غير متصل بقاعدة البيانات السحابية!");

        const downloadUrl = "https://files.catbox.moe/kvjbvp.sqlite";
        const msg = await message.reply("⏳ **جاري سحب الملف الإمبراطوري (45 ميجا) واستخراج هيكل الجداول الأصلي...**");
        
        const tempPath = path.join(process.cwd(), `temp_migrate_${Date.now()}.sqlite`);
        const file = fs.createWriteStream(tempPath);

        try {
            const response = await axios({
                method: 'GET',
                url: downloadUrl,
                responseType: 'stream',
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 120000
            });

            response.data.pipe(file);

            file.on('finish', async function() {
                file.close();
                await msg.edit("✅ **تم السحب! جاري تحليل الهيكل الداخلي للملف (لا تقم بإيقاف البوت 🛑)**");

                try {
                    const sqliteDb = new Database(tempPath);
                    
                    // استخراج هيكل الجداول من SQLite
                    const schemaRows = sqliteDb.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
                    
                    let schemaContent = "====== 📊 هيكل الجداول الأصلي ======\n\n";
                    schemaRows.forEach(row => {
                        schemaContent += `-- Table: ${row.name}\n`;
                        schemaContent += `${row.sql};\n\n`;
                    });
                    schemaContent += "=====================================\n";

                    const schemaFilePath = path.join(process.cwd(), 'old_schema.txt');
                    fs.writeFileSync(schemaFilePath, schemaContent);

                    const attachment = new AttachmentBuilder(schemaFilePath);
                    
                    await msg.edit({ 
                        content: "✅ **تم استخراج الهيكل الأصلي من الملف المحمل بنجاح!**\n👇 انسخ محتوى هذا الملف وأرسله لي لنقوم ببناء الجداول السحابية المطابقة له بنسبة 100% قبل بدء الهجرة الفعلية.", 
                        files: [attachment] 
                    });

                    // إغلاق الداتا بيس وحذف الملفات المؤقتة
                    sqliteDb.close();
                    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                    setTimeout(() => { if (fs.existsSync(schemaFilePath)) fs.unlinkSync(schemaFilePath); }, 10000);

                } catch (err) {
                    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                    await msg.edit(`❌ **خطأ أثناء تحليل الهيكل:**\n\`\`\`js\n${err.message}\n\`\`\``);
                }
            });
        } catch (err) {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            await msg.edit(`❌ فشل التحميل من الرابط.`);
        }
    }
};
