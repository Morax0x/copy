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
    aliases: ['مسح', 'تنظيف', 'د'], // الاختصارات المقترحة
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
            // في الرسائل العادية، نحذف رسالة الأمر ثم نرسل الرد ثم نحذفه
            try { await interactionOrMessage.delete().catch(() => {}); } catch(e) {}
            const msg = await interactionOrMessage.channel.send(payload);
            // حذف رسالة البوت بعد 5 ثواني
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
            // منطق الـ Prefix الذكي
            // الأمثلة:
            // -clear          => مسح 100
            // -clear 50       => مسح 50
            // -clear @user    => مسح 30 للعضو
            // -clear @user 50 => مسح 50 للعضو
            // -clear global @user => مسح شامل 30
            
            const firstArg = args[0];
            const secondArg = args[1];
            const mention = interactionOrMessage.mentions.users.first();

            if (!firstArg) {
                // حالة: -clear (بدون شيء)
                subcommand = 'amount';
                amount = 100;
            } else if (!isNaN(firstArg)) {
                // حالة: -clear 50
                subcommand = 'amount';
                amount = parseInt(firstArg);
            } else if (mention && (firstArg.includes(mention.id))) {
                // حالة: -clear @user [number]
                subcommand = 'user';
                targetUser = mention;
                amount = !isNaN(secondArg) ? parseInt(secondArg) : 30;
            } else if (['global', 'شامل', 'عام'].includes(firstArg.toLowerCase())) {
                // حالة: -clear global @user
                subcommand = 'global';
                targetUser = interactionOrMessage.mentions.users.first();
                if (!targetUser) return replyFunc({ content: "❌ **يرجى منشن العضو للمسح الشامل.**" });
                // البحث عن الرقم في الخانة الثالثة
                amount = args[2] && !isNaN(args[2]) ? parseInt(args[2]) : 30;
            } else {
                return replyFunc({ content: "❌ **صيغة الأمر غير صحيحة.**" });
            }
        }

        // التأكد من الحدود
        if (subcommand === 'amount') amount = amount || 100; // الافتراضي 100
        if (amount > 100) amount = 100; // الحد الأقصى للديسكورد

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
            amount = amount || 30; // الافتراضي 30
            const channel = interactionOrMessage.channel;
            
            // جلب آخر 100 رسالة (للبحث فيها)
            const messages = await channel.messages.fetch({ limit: 100 });
            // فلترة رسائل العضو المحدد فقط
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
            amount = amount || 30; // الافتراضي 30
            const guild = interactionOrMessage.guild;
            
            // رسالة انتظار لأن العملية قد تطول
            let progressMsg;
            if (isSlash) {
                await interactionOrMessage.editReply({ content: `🔄 **جاري المسح الشامل لرسائل ${targetUser}... يرجى الانتظار.**` });
            } else {
                progressMsg = await interactionOrMessage.channel.send(`🔄 **جاري المسح الشامل لرسائل ${targetUser}... يرجى الانتظار.**`);
            }

            let totalDeleted = 0;
            let channelsChecked = 0;
            // نأخذ القنوات النصية فقط
            const textChannels = guild.channels.cache.filter(c => c.isTextBased() && !c.isVoiceBased());

            for (const [id, channel] of textChannels) {
                // تخطي القنوات التي لا يملك البوت صلاحية فيها
                if (!channel.permissionsFor(guild.members.me).has(PermissionsBitField.Flags.ManageMessages)) continue;

                try {
                    // البحث في آخر 50 رسالة بكل قناة لتسريع العملية
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
