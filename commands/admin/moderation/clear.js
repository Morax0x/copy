const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');

module.exports = {
    // --- إعدادات Slash Command ---
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('🧹 أدوات تنظيف ومسح الرسائل المتطورة.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
        .addSubcommand(sub => 
            sub.setName('amount')
                .setDescription('مسح عدد معين من الرسائل (الافتراضي 100).')
                .addIntegerOption(opt => opt.setName('count').setDescription('العدد').setMinValue(1).setMaxValue(100))
        )
        .addSubcommand(sub => 
            sub.setName('user')
                .setDescription('مسح رسائل عضو معين في هذه القناة.')
                .addUserOption(opt => opt.setName('target').setDescription('العضو').setRequired(true))
                .addIntegerOption(opt => opt.setName('count').setDescription('العدد (الافتراضي 30)').setMinValue(1).setMaxValue(100))
        )
        .addSubcommand(sub => 
            sub.setName('global')
                .setDescription('⚠ مسح رسائل عضو من كل القنوات (مسح شامل).')
                .addUserOption(opt => opt.setName('target').setDescription('العضو').setRequired(true))
                .addIntegerOption(opt => opt.setName('count').setDescription('العدد لكل قناة (الافتراضي 30)').setMinValue(1).setMaxValue(50))
        ),

    // --- إعدادات Prefix Command ---
    name: 'clear',
    aliases: ['مسح', 'تنظيف', 'د'], 
    description: "نظام مسح الرسائل",
    category: "Moderation",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let subcommand, amount, targetUser, replyFunc;

        // دالة الرد الموحدة
        replyFunc = async (payload) => {
            if (isSlash) {
                if (interactionOrMessage.deferred || interactionOrMessage.replied) return interactionOrMessage.editReply(payload);
                return interactionOrMessage.reply(payload);
            }
            try { await interactionOrMessage.delete().catch(() => {}); } catch(e) {}
            const msg = await interactionOrMessage.channel.send(payload);
            setTimeout(() => msg.delete().catch(() => {}), 5000);
            return msg;
        };

        // 1. التحقق من الصلاحيات
        const member = isSlash ? interactionOrMessage.member : interactionOrMessage.member;
        if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            const err = { content: "⛔ **ليس لديك صلاحية `Manage Messages`!**", ephemeral: true };
            if (isSlash) return interactionOrMessage.reply(err);
            return interactionOrMessage.reply(err).then(m => setTimeout(() => m.delete(), 5000));
        }

        // 2. معالجة المدخلات (Slash vs Prefix)
        if (isSlash) {
            await interactionOrMessage.deferReply({ ephemeral: true });
            subcommand = interactionOrMessage.options.getSubcommand();
            targetUser = interactionOrMessage.options.getUser('target');
            amount = interactionOrMessage.options.getInteger('count');
        } else {
            const firstArg = args[0];
            const secondArg = args[1];
            const mention = interactionOrMessage.mentions.users.first();

            if (!firstArg) {
                subcommand = 'amount';
                amount = 100;
            } else if (!isNaN(firstArg)) {
                subcommand = 'amount';
                amount = parseInt(firstArg);
            } else if (mention && (firstArg.includes(mention.id))) {
                subcommand = 'user';
                targetUser = mention;
                amount = !isNaN(secondArg) ? parseInt(secondArg) : 30;
            } else if (['global', 'شامل', 'عام'].includes(firstArg.toLowerCase())) {
                subcommand = 'global';
                targetUser = interactionOrMessage.mentions.users.first();
                if (!targetUser) return replyFunc({ content: "❌ **يرجى منشن العضو للمسح الشامل.**" });
                amount = args[2] && !isNaN(args[2]) ? parseInt(args[2]) : 30;
            } else {
                return replyFunc({ content: "❌ **صيغة الأمر غير صحيحة.**" });
            }
        }

        if (subcommand === 'amount') amount = amount || 100; 
        if (amount > 100) amount = 100; 

        // ============================
        // 🔹 1. المسح العادي (الكل)
        // ============================
        if (subcommand === 'amount') {
            try {
                const deleted = await interactionOrMessage.channel.bulkDelete(amount, true);
                return replyFunc({ content: `🧹 **تم كنس ${deleted.size} رسالة بنجاح!**` });
            } catch (err) {
                return replyFunc({ content: "❌ **لا يمكن حذف الرسائل التي مر عليها أكثر من 14 يومًا.**" });
            }
        }

        // ============================
        // 🔹 2. مسح رسائل عضو (قناة)
        // ============================
        else if (subcommand === 'user') {
            amount = amount || 30; 
            const channel = interactionOrMessage.channel;
            
            const messages = await channel.messages.fetch({ limit: 100 });
            const userMessages = messages.filter(m => m.author.id === targetUser.id).first(amount);

            if (userMessages.length === 0) {
                return replyFunc({ content: `⚠️ **لم يتم العثور على رسائل حديثة للعضو ${targetUser} في هذه القناة.**` });
            }

            try {
                await channel.bulkDelete(userMessages, true);
                return replyFunc({ content: `👤 **تم مسح ${userMessages.length} رسالة للعضو ${targetUser}.**` });
            } catch (err) {
                return replyFunc({ content: "❌ **خطأ أثناء الحذف (ربما الرسائل قديمة).**" });
            }
        }

        // ============================
        // 🔹 3. المسح الشامل (كل القنوات)
        // ============================
        else if (subcommand === 'global') {
            amount = amount || 30; 
            const guild = interactionOrMessage.guild;
            
            let progressMsg;
            if (isSlash) {
                await interactionOrMessage.editReply({ content: `🔄 **جاري المسح الشامل لرسائل ${targetUser}... يرجى الانتظار.**` });
            } else {
                progressMsg = await interactionOrMessage.channel.send(`🔄 **جاري المسح الشامل لرسائل ${targetUser}... يرجى الانتظار.**`);
            }

            let totalDeleted = 0;
            let channelsChecked = 0;
            const textChannels = guild.channels.cache.filter(c => c.isTextBased() && !c.isVoiceBased());

            for (const [id, channel] of textChannels) {
                if (!channel.permissionsFor(guild.members.me).has(PermissionsBitField.Flags.ManageMessages)) continue;

                try {
                    const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
                    if (!messages) continue;

                    const userMessages = messages.filter(m => m.author.id === targetUser.id).first(amount);
                    
                    if (userMessages.length > 0) {
                        await channel.bulkDelete(userMessages, true).catch(() => {});
                        totalDeleted += userMessages.length;
                    }
                } catch (e) {}
                channelsChecked++;
            }

            const finalMsg = `🌍 **انتـهى المسح الشامل!**\nتم حذف **${totalDeleted}** رسالة للعضو ${targetUser} من **${channelsChecked}** قناة.`;
            
            if (isSlash) return interactionOrMessage.editReply({ content: finalMsg });
            if (progressMsg) progressMsg.edit(finalMsg).then(m => setTimeout(() => m.delete(), 10000));
            else interactionOrMessage.channel.send(finalMsg);
        }
    }
};
