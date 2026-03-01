const { PermissionsBitField, ChannelType, SlashCommandBuilder } = require('discord.js');

console.log("✅ Command Loaded: set-extra-casino"); // رسالة تأكيد التحميل

module.exports = {
    data: new SlashCommandBuilder()
        .setName('كازينو-اضافي')
        .setDescription('يحدد روم كازينو إضافي (للعب فقط بدون إشعارات).')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addChannelOption(option =>
            option.setName('القناة')
                .setDescription('القناة الإضافية للكازينو')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)), 

    name: 'set-extra-casino',
    aliases: ['كازينو2', 'تحديد-كازينو-اضافي', 'set-extra-casino'], // أضفت الاسم الإنجليزي كـ alias احتياطاً
    category: "Leveling", 
    description: 'يحدد روم كازينو إضافي (تعمل فيه الأوامر بدون بريفكس).',

    async execute(interactionOrMessage, args) {

        let interaction, message, member, guild, client, sql;
        let channel;

        // تحديد هل الأمر سلاش أم عادي
        const isSlash = !!interactionOrMessage.isChatInputCommand;

        if (isSlash) {
            interaction = interactionOrMessage;
            member = interaction.member;
            guild = interaction.guild;
            client = interaction.client;
            sql = client.sql;
            channel = interaction.options.getChannel('القناة');
        } else {
            message = interactionOrMessage;
            member = message.member;
            guild = message.guild;
            client = message.client;
            sql = client.sql;
            
            // محاولة جلب القناة من المنشن أو الآيدي
            channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]);
        }

        // دالة الرد الموحدة
        const reply = async (content, ephemeral = false) => {
            if (isSlash) {
                if (interaction.replied || interaction.deferred) return interaction.followUp({ content, ephemeral });
                return interaction.reply({ content, ephemeral });
            } else {
                return message.reply(content);
            }
        };

        // التحقق من الصلاحيات
        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return reply('❌ | أنت بحاجة إلى صلاحية `ManageGuild`.', true);
        }

        // التحقق من وجود القناة
        if (!channel || channel.type !== ChannelType.GuildText) {
            return reply('**الاستخدام:** `-كازينو2 <#channel>`', true);
        }

        try {
            // حفظ القناة في قاعدة البيانات
            sql.prepare(`
                INSERT INTO settings (guild, casinoChannelID2) 
                VALUES (@guild, @casinoChannelID2) 
                ON CONFLICT(guild) DO UPDATE SET 
                casinoChannelID2 = excluded.casinoChannelID2
            `).run({
                guild: guild.id,
                casinoChannelID2: channel.id
            });

            return reply(`✅ | تم تحديد روم الكازينو **الإضافي** بنجاح: ${channel}\n(ستعمل فيه الأوامر بدون بريفكس، لكن الإشعارات ستبقى في الروم الأساسي).`);

        } catch (err) {
            console.error("[Database Error] set-extra-casino:", err);
            // إذا كان الخطأ بسبب عدم وجود العمود، سيظهر هنا
            if (err.message.includes("no such column")) {
                return reply('❌ | خطأ: قاعدة البيانات لم تتحدث بعد. الرجاء إعادة تشغيل البوت بالكامل لتفعيل التحديثات.', true);
            }
            return reply('❌ | حدث خطأ أثناء تحديث قاعدة البيانات.', true);
        }
    }
};
