const { EmbedBuilder, PermissionsBitField, SlashCommandBuilder } = require("discord.js");

module.exports = {
    // --- إعدادات Slash Command ---
    data: new SlashCommandBuilder()
        .setName('lock')
        .setDescription('🔒 يقفل القناة ويمنع الأعضاء من الكتابة فيها.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
        .addStringOption(option => 
            option.setName('reason')
                .setDescription('سبب قفل القناة (اختياري)')
                .setRequired(false)
        ),

    // --- إعدادات Prefix Command ---
    name: 'lock',
    aliases: ['close', 'قفل'],
    description: "يقفل القناة الحالية.",
    category: "Moderation",

    async execute(interactionOrMessage, args) {
        // تحديد نوع الأمر (سلاش أو رسالة عادية)
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, member, channel, reason;

        if (isSlash) {
            interaction = interactionOrMessage;
            member = interaction.member;
            channel = interaction.channel;
            reason = interaction.options.getString('reason') || 'لم يتم تحديد سبب';
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            member = message.member;
            channel = message.channel;
            reason = args.length > 0 ? args.join(' ') : 'لم يتم تحديد سبب';
        }

        // دالة الرد الموحدة
        const reply = async (payload) => {
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };

        // 1. التحقق من الصلاحيات
        if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return reply({ content: "⛔️ **عذراً، لا تملك صلاحية `Manage Channels` لاستخدام هذا الأمر!**", ephemeral: true });
        }

        // 2. التحقق من حالة القناة (هل هي مقفلة أصلاً؟)
        // نفحص صلاحيات الرول @everyone في هذه القناة
        const everyoneRole = channel.guild.roles.everyone;
        const currentPerms = channel.permissionOverwrites.cache.get(everyoneRole.id);

        // إذا كان SendMessages مضبوط على false (محظور)، يعني القناة مقفلة
        if (currentPerms && currentPerms.deny.has(PermissionsBitField.Flags.SendMessages)) {
            return reply({ content: "⚠️ **هذه القناة مقفلة بالفعل!**", ephemeral: true });
        }

        try {
            // 3. تنفيذ القفل
            await channel.permissionOverwrites.edit(everyoneRole, {
                SendMessages: false, // منع الكتابة
                AddReactions: false  // (اختياري) منع إضافة رياكشن
            });

            // 4. تصميم الـ Embed
            const lockEmbed = new EmbedBuilder()
                .setTitle('🔒 تـم قـفـل الـقـنـاة')
                .setDescription(`تم إغلاق القناة بنجاح. لن يتمكن الأعضاء من الكتابة هنا حتى إشعار آخر.`)
                .addFields(
                    { name: '👤 بواسطة:', value: `<@${member.id}>`, inline: true },
                    { name: '📝 السبب:', value: `\`${reason}\``, inline: true }
                )
                .setColor('#FF0000') // أحمر
                .setThumbnail('https://cdn-icons-png.flaticon.com/512/3064/3064197.png') // أيقونة قفل
                .setFooter({ text: `Server: ${channel.guild.name}`, iconURL: channel.guild.iconURL() })
                .setTimestamp();

            await reply({ embeds: [lockEmbed] });

        } catch (error) {
            console.error(error);
            return reply({ content: "❌ **حدث خطأ أثناء محاولة قفل القناة.** (تأكد أن صلاحيات البوت أعلى من القناة).", ephemeral: true });
        }
    }
};
