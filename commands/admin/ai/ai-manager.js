const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
// 👇 تأكد أن هذا المسار صحيح!
// إذا كان الملف في commands/admin/ai/ فالنقط ../../../ صحيحة للوصول لـ utils
const aiConfig = require('../../../utils/aiConfig'); 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ai')
        .setDescription('🤖 لوحة تحكم الذكاء الاصطناعي (الإمبراطورة)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        // 1. إضافة قناة
        .addSubcommand(sub => 
            sub.setName('add')
                .setDescription('✅ تفعيل الذكاء في قناة معينة')
                .addChannelOption(option => option.setName('channel').setDescription('اختر القناة').setRequired(true))
                .addStringOption(option => 
                    option.setName('mode')
                    .setDescription('وضعية الشخصية')
                    .setRequired(true)
                    .addChoices(
                        { name: '🛡️ عام (SFW) - شخصية عادية', value: 'sfw' },
                        { name: '🔞 خاص (NSFW) - شخصية جريئة ومنحرفة', value: 'nsfw' }
                    )
                )
        )
        // 2. إزالة قناة
        .addSubcommand(sub => 
            sub.setName('remove')
                .setDescription('❌ إيقاف الذكاء في قناة معينة')
                .addChannelOption(option => option.setName('channel').setDescription('اختر القناة').setRequired(true))
        )
        // 3. القائمة
        .addSubcommand(sub => 
            sub.setName('list')
                .setDescription('📜 عرض قائمة القنوات المفعلة')
        )
        // 4. حظر مستخدم
        .addSubcommand(sub => 
            sub.setName('block')
                .setDescription('🚫 منع عضو من التحدث مع البوت')
                .addUserOption(option => option.setName('user').setDescription('العضو').setRequired(true))
        )
        // 5. فك حظر
        .addSubcommand(sub => 
            sub.setName('unblock')
                .setDescription('🟢 السماح لعضو بالتحدث مع البوت مجدداً')
                .addUserOption(option => option.setName('user').setDescription('العضو').setRequired(true))
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        // --- إضافة قناة ---
        if (subcommand === 'add') {
            const channel = interaction.options.getChannel('channel');
            const mode = interaction.options.getString('mode');
            const isNsfw = mode === 'nsfw';

            // الحفظ في الداتابيس
            aiConfig.addChannel(channel.id, isNsfw);

            const embed = new EmbedBuilder()
                .setColor(isNsfw ? 0xFF0000 : 0x00FF00)
                .setTitle('✅ تم تفعيل النظام بنجاح')
                .setDescription(`**القناة:** ${channel}\n**الوضع:** ${isNsfw ? '🔞 خاص (NSFW)' : '🛡️ عام (SFW)'}`)
                .setFooter({ text: 'الإمبراطورة موراكس جاهزة للعمل' });
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // --- إزالة قناة ---
        if (subcommand === 'remove') {
            const channel = interaction.options.getChannel('channel');
            
            aiConfig.removeChannel(channel.id);

            return interaction.reply({ 
                content: `✅ **تم إيقاف** خدمات الذكاء الاصطناعي في قناة ${channel}.`, 
                ephemeral: true 
            });
        }

        // --- القائمة ---
        if (subcommand === 'list') {
            const channels = aiConfig.getAllChannels();
            // تحويل البيانات لنص
            const channelList = Object.entries(channels).map(([id, settings]) => {
                return `<#${id}> : ${settings.nsfw ? '🔞 **خاص**' : '🛡️ **عام**'}`;
            }).join('\n');

            const embed = new EmbedBuilder()
                .setColor(0xD4AF37) // لون ذهبي
                .setTitle('📜 قنوات الذكاء الاصطناعي المفعلة')
                .setDescription(channelList || "🚫 **لا توجد قنوات مفعلة حالياً.**\nاستخدم `/ai add` لإضافة قناة.");

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // --- حظر مستخدم ---
        if (subcommand === 'block') {
            const user = interaction.options.getUser('user');
            aiConfig.blockUser(user.id);
            return interaction.reply({ content: `🚫 **تم حظر** العضو ${user} من استخدام البوت.`, ephemeral: true });
        }

        // --- فك حظر ---
        if (subcommand === 'unblock') {
            const user = interaction.options.getUser('user');
            aiConfig.unblockUser(user.id);
            return interaction.reply({ content: `🟢 **تم فك الحظر** عن العضو ${user}.`, ephemeral: true });
        }
    }
};
