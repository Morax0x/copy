const { EmbedBuilder, Colors, SlashCommandBuilder } = require("discord.js");

const EMOJI_MORA = '<:mora:1435647151349698621>';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('سحب')
        .setDescription('سحب المورا من البنك إلى رصيدك (الكاش).')
        .addStringOption(option =>
            option.setName('المبلغ')
            .setDescription('المبلغ الذي تريد سحبه أو "all" / "الكل"')
            .setRequired(true)),

    name: 'withdraw',
    aliases: ['سحب', 'with'],
    category: "Economy",
    cooldown: 5, // ✅ تم التعديل: 5 ثواني لمنع التكرار السريع
    description: 'سحب المورا من البنك إلى رصيدك الكاش',

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, user;
        let amountArg;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            user = interaction.user;
            amountArg = interaction.options.getString('المبلغ');
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            user = message.author;
            amountArg = args[0];
        }

        const reply = async (payload) => {
            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.channel.send(payload);
            }
        };

        const replyError = async (content) => {
            const payload = { content, ephemeral: true };
            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.reply(payload);
            }
        };

        const guildId = guild.id;
        const sql = client.sql; // ✅ نحتاج الوصول المباشر لقاعدة البيانات
        const getScore = client.getLevel;

        // 1. جلب البيانات فقط لمعرفة الرصيد الحالي وحساب "الكل"
        let data = getScore.get(user.id, guildId);
        if (!data) {
             data = { ...client.defaultData, user: user.id, guild: guildId };
             // إذا كان المستخدم جديداً، نحفظه أولاً لضمان وجود صف له في الجدول
             client.setLevel.run(data); 
        }

        const userBank = data.bank || 0;
        let amountToWithdraw;

        // حساب المبلغ المطلوب
        if (!amountArg || amountArg.toLowerCase() === 'all' || amountArg.toLowerCase() === 'الكل') {
            amountToWithdraw = userBank;
        } else {
            amountToWithdraw = parseInt(amountArg.replace(/,/g, ''));
            if (isNaN(amountToWithdraw)) {
                 return replyError(`الاستخدام: \`/سحب <المبلغ | الكل>\` (المبلغ الذي أدخلته ليس رقماً).`);
            }
        }

        if (amountToWithdraw <= 0) {
            return replyError(`ليس لديك أي مورا في البنك لسحبها!`);
        }

        // 2. التحقق المبدئي (لتحسين تجربة المستخدم فقط)
        if (userBank < amountToWithdraw) {
            return replyError(` <:stop:1436337453098340442> ليس لديك هذا المبلغ في البنك لسحبه! (رصيدك البنكي: ${userBank.toLocaleString()} ${EMOJI_MORA}) `);
        }

        try {
            // 🔥🔥 الحل الجذري (Atomic Transaction) 🔥🔥
            // نقوم بخصم البنك وإضافة الكاش في أمر SQL واحد، بشرط أن يكون رصيد البنك كافياً
            const transaction = sql.prepare(`
                UPDATE levels 
                SET bank = bank - ?, 
                    mora = mora + ? 
                WHERE user = ? AND guild = ? AND bank >= ?
            `);

            const result = transaction.run(
                amountToWithdraw, // المبلغ يخصم من البنك
                amountToWithdraw, // المبلغ يضاف للكاش
                user.id, 
                guildId, 
                amountToWithdraw // الشرط: يجب أن يكون في البنك هذا المبلغ على الأقل
            );

            // إذا كانت changes تساوي 0، فهذا يعني أن الشرط لم يتحقق (الرصيد تغير فجأة أو غير كافٍ)
            if (result.changes === 0) {
                return replyError(`❌ فشلت العملية: يبدو أن رصيدك تغير أثناء المحاولة أو أنه غير كافٍ.`);
            }

            // 3. جلب البيانات المحدثة من الداتابيس لعرضها في الرسالة
            const newData = getScore.get(user.id, guildId);

            const embed = new EmbedBuilder()
                .setColor("Random")
                .setTitle('✶ تـمت عمليـة السحـب !')
                .setThumbnail(user.displayAvatarURL())
                .setDescription(
                    `❖ تـم سـحـب: **${amountToWithdraw.toLocaleString()}** ${EMOJI_MORA}\n` +
                    `❖ رصـيد البـنك: **${newData.bank.toLocaleString()}** ${EMOJI_MORA}\n` +
                    `❖ رصـيـدك الكـاش: **${newData.mora.toLocaleString()}** ${EMOJI_MORA}`
                );

            await reply({ embeds: [embed] });

        } catch (error) {
            console.error("Withdraw Error:", error);
            return replyError("حدث خطأ غير متوقع أثناء عملية السحب.");
        }
    }
};
