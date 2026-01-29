// events/boostDetector.js
const { EmbedBuilder } = require('discord.js');

// 🎨 قائمة الصور العشوائية
const BOOST_IMAGES = [
    'https://i.postimg.cc/7P2ZnqWn/0880cb8a-9c19-4bcc-b48e-fe1f7d18e61e.png',
    'https://i.postimg.cc/66vpfBmn/1118410b-2e5e-42eb-b4e8-332da08cf6fe.png',
    'https://i.postimg.cc/tRx4N9Md/3a34f764-270e-4fba-b4e9-a2d9c5333fd8.png',
    'https://i.postimg.cc/7P2ZnqWM/ec27dbd0-2b6f-4efa-92b3-b20237316eb7.png'
];

// 🎉 الرياكشنات المطلوبة بالترتيب
const REACTIONS = [
    '1435572304988868769', 
    '1439665966354268201', 
    '1435572329039007889'  
];

module.exports = {
    name: 'messageCreate',
    async execute(message) { // ✅ التعديل: نستقبل message فقط، ونأخذ client منها
        
        const client = message.client; // ✅ الوصول الآمن للعميل

        // 1. تجاهل رسائل البوتات (ماعدا رسائل النظام الخاصة بالبوست)
        if (message.author.bot && message.type !== 8 && message.type !== 9 && message.type !== 10 && message.type !== 11) return;

        // 2. التحقق من القناة المسجلة في الداتابيس
        // ✅ استخدام client.sql بشكل آمن
        const sql = client.sql; 
        if (!sql) return; // حماية إضافية إذا لم تكن قاعدة البيانات جاهزة

        let settings;
        try {
            settings = sql.prepare("SELECT boostChannelID FROM settings WHERE guild = ?").get(message.guild.id);
        } catch (e) { return; }

        if (!settings || !settings.boostChannelID) return;
        if (message.channel.id !== settings.boostChannelID) return;

        // 3. التحقق هل هي رسالة "بوست"؟
        const isSystemBoost = [8, 9, 10, 11].includes(message.type);
        const hasBoostText = message.content.toLowerCase().includes('boosted the server') || 
                             message.content.includes('قام بتعزيز السيرفر') || 
                             (message.system && isSystemBoost);

        if (isSystemBoost || hasBoostText) {
            
            // ✅ تنفيذ الرياكشنات بالترتيب
            try {
                for (const reactionId of REACTIONS) {
                    await message.react(reactionId).catch(() => {});
                    await new Promise(r => setTimeout(r, 300)); 
                }
            } catch (err) {
                // تجاهل أخطاء الرياكشن
            }

            // ✅ اختيار صورة عشوائية
            const randomImage = BOOST_IMAGES[Math.floor(Math.random() * BOOST_IMAGES.length)];

            // ✅ تجهيز رسالة الشكر
            const boosterName = message.author.username; 

            const embed = new EmbedBuilder()
                .setColor('#F47FFF')
                .setDescription(
                    `✥ **${boosterName}**\n` +
                    `✬ مـعـزز جديـد ارتقـى لمصـاف العظمـاء <:sboosting:1439665969864773663>!\n\n` +
                    `✶ شكـرا عـلى دعـم الامبراطـوريـة استمتـع بمميزاتـك الخاصـة <a:NekoCool:1435572459276337245>`
                )
                .setImage(randomImage);

            // إرسال الرسالة
            await message.channel.send({ embeds: [embed] }).catch(() => {});
        }
    }
};
