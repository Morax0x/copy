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
    '1435572304988868769', // <a:wi:...> (استخدمنا الآيدي فقط للسهولة، البوت سيعرفها)
    '1439665966354268201', // <:gboost:...>
    '1435572329039007889'  // <a:wii:...>
];

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        // 1. تجاهل رسائل البوتات (ماعدا رسائل النظام الخاصة بالبوست)
        // رسائل البوست عادة تأتي كـ System Message (MessageType 8, 9, 10, 11)
        // أو تأتي من العضو نفسه لكن بنوع خاص. سنتحقق من محتوى الرسالة ونوعها.
        
        if (message.author.bot && message.type !== 8 && message.type !== 9 && message.type !== 10 && message.type !== 11) return;

        // 2. التحقق من القناة المسجلة في الداتابيس
        const sql = client.sql;
        let settings;
        try {
            settings = sql.prepare("SELECT boostChannelID FROM settings WHERE guild = ?").get(message.guild.id);
        } catch (e) { return; }

        if (!settings || !settings.boostChannelID) return;
        if (message.channel.id !== settings.boostChannelID) return;

        // 3. التحقق هل هي رسالة "بوست"؟
        // الطريقة الأدق: التحقق من نوع الرسالة (MessageType.UserPremiumGuildSubscription) وهو رقم 8، 9، 10، 11
        // الطريقة الاحتياطية: التحقق من النص (في حال لم تكن رسالة نظام)
        const isSystemBoost = [8, 9, 10, 11].includes(message.type);
        const hasBoostText = message.content.toLowerCase().includes('boosted the server') || 
                             message.content.includes('قام بتعزيز السيرفر') || // للعربية إذا كان السيرفر عربي
                             (message.system && (message.type === 8 || message.type === 9 || message.type === 10 || message.type === 11));

        if (isSystemBoost || hasBoostText) {
            
            // ✅ تنفيذ الرياكشنات بالترتيب
            try {
                for (const reactionId of REACTIONS) {
                    await message.react(reactionId).catch(() => {});
                    // تأخير بسيط جداً لضمان الترتيب (اختياري)
                    await new Promise(r => setTimeout(r, 300)); 
                }
            } catch (err) {
                console.error("Boost Reaction Error:", err);
            }

            // ✅ اختيار صورة عشوائية
            const randomImage = BOOST_IMAGES[Math.floor(Math.random() * BOOST_IMAGES.length)];

            // ✅ تجهيز رسالة الشكر
            // اسم العضو (Author) هو المعزز في رسائل النظام
            const boosterName = message.author.username; 

            const embed = new EmbedBuilder()
                .setColor('#F47FFF') // لون وردي/بنفسجي مميز للبوست (Discord Nitro Color)
                .setDescription(
                    `✥ **${boosterName}**\n` +
                    `✬ مـعـزز جديـد ارتقـى لمصـاف العظمـاء <:sboosting:1439665969864773663>!\n\n` +
                    `✶ شكـرا عـلى دعـم الامبراطـوريـة استمتـع بمميزاتـك الخاصـة <a:NekoCool:1435572459276337245>`
                )
                .setImage(randomImage);

            // إرسال الرسالة
            await message.channel.send({ embeds: [embed] }).catch(console.error);
        }
    }
};
