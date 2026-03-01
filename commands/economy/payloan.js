const { EmbedBuilder, Colors, SlashCommandBuilder } = require("discord.js"); // ( 1 ) تم إضافة SlashCommandBuilder

const EMOJI_MORA = '<:mora:1435647151349698621>';
const TOTAL_INTEREST_RATE = 0.10;
const EARLY_PAYOFF_DISCOUNT_RATE = 0.50;

module.exports = {
    // --- ( 2 ) إضافة بيانات أمر السلاش ---
    data: new SlashCommandBuilder()
        .setName('تسديد') // اسم الأمر بالعربي
        .setDescription('سداد القرض الخاص بك (بشكل جزئي أو كامل).')
        .addStringOption(option =>
            option.setName('المبلغ')
            .setDescription('المبلغ الذي تريد دفعه، أو "all" / "كامل" للسداد الكامل')
            .setRequired(false)), // اختياري لعرض الحالة
    // ------------------------------------

    name: 'payloan',
    aliases: ['تسديد', 'سداد-القرض','سداد'],
    category: "Economy",
    description: 'سداد القرض الخاص بك (بشكل جزئي أو كامل).',

    // --- ( 3 ) تعديل دالة التنفيذ ---
    async execute(interactionOrMessage, args) {

        // --- ( 4 ) إضافة معالج الأوامر الهجينة ---
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, user;
        let amountArg;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            user = interaction.user;
            amountArg = interaction.options.getString('المبلغ');
            // سنستخدم deferReply() ولكن سنجعل بعض الردود خاصة (ephemeral)
            await interaction.deferReply({ ephemeral: true }); // البدء برد خاص
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            user = message.author;
            amountArg = args[0];
        }

        // توحيد المدخلات
        if (amountArg) {
            amountArg = amountArg.toLowerCase();
        }

        // --- ( 5 ) توحيد دوال الرد ---
        const replySuccess = async (payload) => {
            // ردود النجاح (العامة)
            if (typeof payload === 'string') payload = { content: payload, ephemeral: false };
            payload.ephemeral = false; // التأكيد على أنه رد عام

            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.reply(payload);
            }
        };

        const replyInfo = async (payload) => {
            // ردود المعلومات والأخطاء (خاصة في السلاش)
            if (typeof payload === 'string') payload = { content: payload, ephemeral: true };
            payload.ephemeral = true; // التأكيد على أنه رد خاص

            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.reply(payload); // الرد في البريفكس عام
            }
        };
        // ------------------------------------

        const sql = client.sql; // ( 6 ) التعديل هنا

        const getLoan = sql.prepare("SELECT * FROM user_loans WHERE userID = ? AND guildID = ? AND remainingAmount > 0");
        const loan = getLoan.get(user.id, guild.id); // ( 7 ) التعديل هنا

        if (!loan) {
            return replyInfo(`✅ ليس لديك أي قروض مستحقة حالياً.`); // ( 8 ) التعديل هنا
        }

        const getScore = client.getLevel; // ( 9 ) التعديل هنا
        const setScore = client.setLevel;
        let data = getScore.get(user.id, guild.id);
        if (!data) data = { ...client.defaultData, user: user.id, guild: guild.id }; // ( 10 ) التعديل هنا

        const userMora = data.mora || 0;
        const userBank = data.bank || 0;
        const totalBalance = userMora + userBank;
        // amountArg تم تعريفه في البداية

        if (!amountArg) {
            const totalToRepay = loan.loanAmount * (1 + TOTAL_INTEREST_RATE);
            const amountPaid = totalToRepay - loan.remainingAmount;
            const principalPaid = Math.min(amountPaid, loan.loanAmount);
            const interestPaid = Math.max(0, amountPaid - loan.loanAmount);
            const principalRemaining = loan.loanAmount - principalPaid;
            const totalInterest = loan.loanAmount * TOTAL_INTEREST_RATE;
            const interestRemaining = totalInterest - interestPaid;
            const finalPayoffAmount = Math.ceil(principalRemaining + (interestRemaining * EARLY_PAYOFF_DISCOUNT_RATE));

            const description = [
                `لديك قرض متبقي بقيمة: **${loan.remainingAmount.toLocaleString()}** ${EMOJI_MORA}.`,
                `\n**للسداد الجزئي:** \`/تسديد <مبلغ>\``,
                `**للسداد الكامل (مع خصم):** \`/تسديد كامل\``,
                `*إذا سددت الآن كاملاً، ستدفع: **${finalPayoffAmount.toLocaleString()}** ${EMOJI_MORA} (بدلاً من ${loan.remainingAmount.toLocaleString()})*`
            ].join('\n');

            return replyInfo(description); // ( 11 ) التعديل هنا
        }

        const deleteLoan = sql.prepare("DELETE FROM user_loans WHERE id = ?");

        if (amountArg === 'all' || amountArg === 'كامل') {
            const totalToRepay = loan.loanAmount * (1 + TOTAL_INTEREST_RATE);
            const amountPaid = totalToRepay - loan.remainingAmount;
            const principalPaid = Math.min(amountPaid, loan.loanAmount);
            const interestPaid = Math.max(0, amountPaid - loan.loanAmount);
            const principalRemaining = loan.loanAmount - principalPaid;
            const totalInterest = loan.loanAmount * TOTAL_INTEREST_RATE;
            const interestRemaining = Math.max(0, totalInterest - interestPaid);
            const finalPayoffAmount = Math.ceil(principalRemaining + (interestRemaining * EARLY_PAYOFF_DISCOUNT_RATE));
            const discountAmount = loan.remainingAmount - finalPayoffAmount;

            if (totalBalance < finalPayoffAmount) {
                return replyInfo(`❌ لا تملك ما يكفي للسداد الكامل! (تحتاج: **${finalPayoffAmount.toLocaleString()}** ${EMOJI_MORA} في الكاش أو البنك).`); // ( 12 ) التعديل هنا
            }

            let amountLeftToPay = finalPayoffAmount;
            if (userMora >= amountLeftToPay) {
                data.mora -= amountLeftToPay;
            } else {
                amountLeftToPay -= userMora;
                data.mora = 0;
                data.bank -= amountLeftToPay;
            }

            setScore.run(data);
            deleteLoan.run(loan.id);

            return replySuccess(`🎉 **تم سداد القرض بالكامل!**\nلقد قمت بسداد مبكر وحصلت على خصم **${discountAmount.toLocaleString()}** ${EMOJI_MORA} (50% من الفائدة المتبقية).\nدفعت: **${finalPayoffAmount.toLocaleString()}** ${EMOJI_MORA}.`); // ( 13 ) التعديل هنا
        }

        const amountToPay = parseInt(amountArg.replace(/,/g, ''));
        if (isNaN(amountToPay) || amountToPay <= 0) {
            return replyInfo(`❌ الرجاء إدخال مبلغ صحيح للسداد.`); // ( 14 ) التعديل هنا
        }

        if (totalBalance < amountToPay) {
            return replyInfo(`❌ لا تملك هذا المبلغ في الكاش أو البنك. (إجمالي رصيدك: **${totalBalance.toLocaleString()}** ${EMOJI_MORA})`); // ( 15 ) التعديل هنا
        }

        if (amountToPay >= loan.remainingAmount) {
            const amountToDeduct = loan.remainingAmount;
            const change = amountToPay - loan.remainingAmount;

            let amountLeftToDeduct = amountToDeduct;
            if (userMora >= amountLeftToDeduct) {
                data.mora -= amountLeftToDeduct;
            } else {
                amountLeftToDeduct -= userMora;
                data.mora = 0;
                data.bank -= amountLeftToDeduct;
            }

            data.mora += change;
            setScore.run(data);
            deleteLoan.run(loan.id);
            return replySuccess(`✅ تم سداد القرض بالكامل. تم إرجاع الباقي (**${change.toLocaleString()}** ${EMOJI_MORA}) إلى رصيدك.`); // ( 16 ) التعديل هنا
        }

        let amountLeftToDeduct = amountToPay;
        if (userMora >= amountLeftToDeduct) {
            data.mora -= amountLeftToDeduct;
        } else {
            amountLeftToDeduct -= userMora;
            data.mora = 0;
            data.bank -= amountLeftToDeduct;
        }

        loan.remainingAmount -= amountToPay;

        sql.prepare("UPDATE user_loans SET remainingAmount = ? WHERE id = ?").run(loan.remainingAmount, loan.id);
        setScore.run(data);

        replySuccess(`✅ تم دفع **${amountToPay.toLocaleString()}** ${EMOJI_MORA}.\nالمبلغ المتبقي للقرض: **${loan.remainingAmount.toLocaleString()}** ${EMOJI_MORA}.`); // ( 17 ) التعديل هنا
    }
};
