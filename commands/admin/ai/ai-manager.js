const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const aiConfig = require('../../../utils/aiConfig'); 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ai')
        .setDescription('🤖 لوحة تحكم الذكاء الاصطناعي (الإمبراطورة)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        
        // 1. إضافة قناة (دائمة)
        .addSubcommand(sub => 
            sub.setName('setup') // غيرت الاسم لـ setup ليكون أوضح، أو اتركه add كما تفضل
               .setDescription('✅ تفعيل الذكاء في قناة معينة بشكل دائم')
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
        
        // 4. 🔥 إدارة الكتاغوري (الجديد) 🔥
        .addSubcommand(sub =>
            sub.setName('category')
               .setDescription('🔒 قفل كتاغوري كامل بنظام الدفع (Pay to Chat)')
               .addStringOption(opt => 
                   opt.setName('action')
                      .setDescription('العملية')
                      .setRequired(true)
                      .addChoices(
                          { name: '🔒 قفل (Add Lock)', value: 'add' },
                          { name: '🔓 فك القفل (Remove Lock)', value: 'remove' }
                      )
               )
               .addChannelOption(opt => 
                   opt.setName('target')
                      .setDescription('اختر الكتاغوري')
                      .addChannelTypes(ChannelType.GuildCategory) // يجبره يختار كتاغوري فقط
                      .setRequired(true)
               )
        )

        // 5. حظر مستخدم
        .addSubcommand(sub => 
            sub.setName('block')
               .setDescription('🚫 منع عضو من التحدث مع البوت')
               .addUserOption(option => option.setName('user').setDescription('العضو').setRequired(true))
        )
        
        // 6. فك حظر
        .addSubcommand(sub => 
            sub.setName('unblock')
               .setDescription('🟢 السماح لعضو بالتحدث مع البوت مجدداً')
               .addUserOption(option => option.setName('user').setDescription('العضو').setRequired(true))
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        // --- 1. تفعيل قناة (Setup/Add) ---
        if (subcommand === 'setup') {
            const channel = interaction.options.getChannel('channel');
            const mode = interaction.options.getString('mode');
            const isNsfw = mode === 'nsfw';

            aiConfig.addChannel(channel.id, isNsfw);

            const embed = new EmbedBuilder()
                .setColor(isNsfw ? 0xFF0000 : 0x00FF00)
                .setTitle('✅ تم تفعيل النظام بنجاح')
                .setDescription(`**القناة:** ${channel}\n**الوضع:** ${isNsfw ? '🔞 خاص (NSFW)' : '🛡️ عام (SFW)'}`)
                .setFooter({ text: 'الإمبراطورة موراكس جاهزة للعمل' });
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // --- 2. إزالة قناة ---
        if (subcommand === 'remove') {
            const channel = interaction.options.getChannel('channel');
            aiConfig.removeChannel(channel.id);
            return interaction.reply({ content: `✅ **تم إيقاف** خدمات الذكاء الاصطناعي في قناة ${channel}.`, ephemeral: true });
        }

        // --- 3. القائمة ---
        if (subcommand === 'list') {
            const channels = aiConfig.getAllChannels();
            const channelList = Object.entries(channels).map(([id, settings]) => {
                return `<#${id}> : ${settings.nsfw ? '🔞 **خاص**' : '🛡️ **عام**'}`;
            }).join('\n');

            const embed = new EmbedBuilder()
                .setColor(0xD4AF37)
                .setTitle('📜 قنوات الذكاء الاصطناعي المفعلة')
                .setDescription(channelList || "🚫 **لا توجد قنوات مفعلة حالياً.**");

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // --- 4. 🔥 إدارة الكتاغوري (Category) 🔥 ---
        if (subcommand === 'category') {
            const action = interaction.options.getString('action');
            const category = interaction.options.getChannel('target');

            if (action === 'add') {
                aiConfig.addRestrictedCategory(interaction.guild.id, category.id);
                return interaction.reply({ 
                    content: `🔒 **تم قفل الكتاغوري بنجاح:** ${category.name}\n\n📌 **كيف يعمل؟**\nأي شخص يحاول التحدث مع البوت في أي قناة داخل هذا الكتاغوري، سيطلب منه البوت دفع **1000 مورا** لفتح القناة لمدة 24 ساعة.`,
                    ephemeral: true 
                });
            } else {
                aiConfig.removeRestrictedCategory(category.id);
                return interaction.reply({ 
                    content: `🔓 **تم فك القفل عن الكتاغوري:** ${category.name}\nالآن يمكن التحدث بحرية (إذا كانت القنوات مفعلة بـ setup).`, 
                    ephemeral: true 
                });
            }
        }

        // --- 5. حظر مستخدم ---
        if (subcommand === 'block') {
            const user = interaction.options.getUser('user');
            aiConfig.blockUser(user.id);
            return interaction.reply({ content: `🚫 **تم حظر** العضو ${user} من استخدام البوت.`, ephemeral: true });
        }

        // --- 6. فك حظر ---
        if (subcommand === 'unblock') {
            const user = interaction.options.getUser('user');
            aiConfig.unblockUser(user.id);
            return interaction.reply({ content: `🟢 **تم فك الحظر** عن العضو ${user}.`, ephemeral: true });
        }
    }
};
