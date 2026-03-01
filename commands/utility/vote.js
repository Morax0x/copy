// commands/utility/vote.js

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Colors } = require("discord.js");

// 🖼️ قائمة الصور العشوائية
const THUMBNAILS = [
    "https://i.postimg.cc/85ML0fm9/download.jpg",
    "https://i.postimg.cc/B6H2VPBR/download_(1).jpg",
    "https://i.postimg.cc/d1rGxZjb/download_(2).jpg",
    "https://i.postimg.cc/d1rGxZjb/download_(2).jpg",
    "https://i.postimg.cc/pTzK65Jg/Post_by_oddarette_4_images.jpg",
    "https://i.postimg.cc/L8GYF65Y/11.jpg",
    "https://i.postimg.cc/g0RwzFLc/download_(3).jpg",
    "https://i.postimg.cc/MGRc62fz/download_(4).jpg",
    "https://i.postimg.cc/5tvH4dQ0/download_(5).jpg",
    "https://i.postimg.cc/pL3hMXrm/download_(6).jpg"
];

// 🔗 رابط التصويت
const VOTE_LINK = "https://top.gg/discord/servers/732581242885705728/vote";

module.exports = {
    name: 'vote',
    description: 'صوت للامبراطورية واحصل على مكافآت',
    aliases: ['تصويت', 'صوت'],
    data: new SlashCommandBuilder()
        .setName('vote')
        .setDescription('Vote for the Empire and get rewards'),

    async execute(message, args) {
        // دالة مساعدة لإنشاء الايمبد والأزرار (عشان نستخدمها في الشات وفي الخاص)
        const createVotePayload = () => {
            const randomImage = THUMBNAILS[Math.floor(Math.random() * THUMBNAILS.length)];
            
            const embed = new EmbedBuilder()
                .setTitle('✥ صـوت للامبراطـوريـة')
                .setDescription(`✦  للتصـويـت [اضغـط هـنـا](${VOTE_LINK})\n✦ يمكـنـك التصويـت مـرة كـل 12 سـاعـة`)
                .setThumbnail(randomImage)
                .setColor('Random')
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('remind_12h')
                    .setLabel('ذكـرنـي بـعـد 12 سـاعـة')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('⏰'),
                new ButtonBuilder()
                    .setCustomId('remind_24h')
                    .setLabel('ذكـرنـي بـعـد 24 سـاعـة')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📅')
            );

            return { embeds: [embed], components: [row] };
        };

        // دالة لمعالجة التذكير (التايمر)
        const handleReminder = async (interaction, timeMs, label) => {
            await interaction.reply({ content: `✅ **تم!** سأقوم بتذكيرك في الخاص بعد **${label}** لتقوم بالتصويت مجدداً.`, ephemeral: true });

            setTimeout(async () => {
                try {
                    // محاولة إرسال رسالة للمستخدم في الخاص
                    const user = interaction.user;
                    const dmPayload = createVotePayload();
                    
                    // تعديل بسيط لرسالة الخاص عشان يعرف انه تذكير
                    dmPayload.content = `🔔 **تنبيه:** حان موعد التصويت يا بطل!`;
                    
                    const dmMessage = await user.send(dmPayload);

                    // 🔥 تفعيل الأزرار داخل الخاص (عشان يقدر يجدد التذكير) 🔥
                    const collector = dmMessage.createMessageComponentCollector({ componentType: ComponentType.Button, time: 24 * 60 * 60 * 1000 }); // زر الخاص شغال 24 ساعة
                    
                    collector.on('collect', async i => {
                        const newTime = i.customId === 'remind_12h' ? 12 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
                        const newLabel = i.customId === 'remind_12h' ? '12 ساعة' : '24 ساعة';
                        
                        // تكرار العملية (Recursion)
                        handleReminder(i, newTime, newLabel);
                    });

                } catch (err) {
                    console.error(`[Vote Reminder] Could not send DM to ${interaction.user.tag}:`, err.message);
                }
            }, timeMs);
        };

        // 1. إرسال الرسالة الأساسية في الشات
        const initialPayload = createVotePayload();
        const sentMsg = await message.reply(initialPayload);

        // 2. استقبال الضغطات على الأزرار في الشات
        // نسمح لأي شخص بالضغط لعمل تذكير خاص به
        const collector = sentMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 600000 }); // الزر شغال 10 دقايق

        collector.on('collect', async i => {
            const timeMs = i.customId === 'remind_12h' ? 12 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
            const label = i.customId === 'remind_12h' ? '12 ساعة' : '24 ساعة';
            
            await handleReminder(i, timeMs, label);
        });
    }
};
