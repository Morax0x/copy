const { EmbedBuilder, Colors, SlashCommandBuilder } = require("discord.js");

const EMOJI_MORA = '<:mora:1435647151349698621>';
const TOTAL_INTEREST_RATE = 0.10;
const EARLY_PAYOFF_DISCOUNT_RATE = 0.50;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('تسديد') 
        .setDescription('سداد القرض الخاص بك (بشكل جزئي أو كامل).')
        .addStringOption(option =>
            option.setName('المبلغ')
            .setDescription('المبلغ الذي تريد دفعه، أو "all" / "كامل" للسداد الكامل')
            .setRequired(false)), 

    name: 'payloan',
    aliases: ['تسديد', 'سداد-القرض','سداد'],
    category: "Economy",
    description: 'سداد القرض الخاص بك - بشكل جزئي أو كامل',

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
            await interaction.deferReply({ ephemeral: true }); 
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            user = message.author;
            amountArg = args[0];
        }

        if (amountArg) {
            amountArg = amountArg.toLowerCase();
        }

        const replySuccess = async (payload) => {
            if (typeof payload === 'string') payload = { content: payload, ephemeral: false };
            payload.ephemeral = false; 

            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.reply(payload);
            }
        };

        const replyInfo = async (payload) => {
            if (typeof payload === 'string') payload = { content: payload, ephemeral: true };
            payload.ephemeral = true; 

            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.reply(payload); 
            }
        };

        const db = client.sql; 

        const getLoanRes = await db.query("SELECT * FROM user_loans WHERE userID = $1 AND guildID = $2 AND remainingAmount > 0", [user.id, guild.id]);
        const loan = getLoanRes.rows[0]; 

        if (!loan) {
            return replyInfo(`✅ ليس لديك أي قروض مستحقة حالياً.`); 
        }

        let data = await client.getLevel(user.id, guild.id);
        if (!data) data = { ...client.defaultData, user: user.id, guild: guild.id }; 

        const userMora = Number(data.mora) || 0;
        const userBank = Number(data.bank) || 0;
        const totalBalance = userMora + userBank;
        
        const loanAmount = Number(loan.loanamount || loan.loanAmount);
        let remainingAmount = Number(loan.remainingamount || loan.remainingAmount);

        if (!amountArg) {
            const totalToRepay = loanAmount * (1 + TOTAL_INTEREST_RATE);
            const amountPaid = totalToRepay - remainingAmount;
            const principalPaid = Math.min(amountPaid, loanAmount);
            const interestPaid = Math.max(0, amountPaid - loanAmount);
            const principalRemaining = loanAmount - principalPaid;
            const totalInterest = loanAmount * TOTAL_INTEREST_RATE;
            const interestRemaining = totalInterest - interestPaid;
            const finalPayoffAmount = Math.ceil(principalRemaining + (interestRemaining * EARLY_PAYOFF_DISCOUNT_RATE));

            const description = [
                `لديك قرض متبقي بقيمة: **${remainingAmount.toLocaleString()}** ${EMOJI_MORA}.`,
                `\n**للسداد الجزئي:** \`/تسديد <مبلغ>\``,
                `**للسداد الكامل (مع خصم):** \`/تسديد كامل\``,
                `*إذا سددت الآن كاملاً، ستدفع: **${finalPayoffAmount.toLocaleString()}** ${EMOJI_MORA} (بدلاً من ${remainingAmount.toLocaleString()})*`
            ].join('\n');

            return replyInfo(description); 
        }

        if (['all', 'كامل', 'الكل', 'full'].includes(amountArg)) {
            const totalToRepay = loanAmount * (1 + TOTAL_INTEREST_RATE);
            const amountPaid = totalToRepay - remainingAmount;
            const principalPaid = Math.min(amountPaid, loanAmount);
            const interestPaid = Math.max(0, amountPaid - loanAmount);
            const principalRemaining = loanAmount - principalPaid;
            const totalInterest = loanAmount * TOTAL_INTEREST_RATE;
            const interestRemaining = Math.max(0, totalInterest - interestPaid);
            const finalPayoffAmount = Math.ceil(principalRemaining + (interestRemaining * EARLY_PAYOFF_DISCOUNT_RATE));
            const discountAmount = remainingAmount - finalPayoffAmount;

            if (totalBalance < finalPayoffAmount) {
                return replyInfo(`❌ لا تملك ما يكفي للسداد الكامل! (تحتاج: **${finalPayoffAmount.toLocaleString()}** ${EMOJI_MORA} في الكاش أو البنك).`); 
            }

            let amountLeftToPay = finalPayoffAmount;
            data.mora = userMora;
            data.bank = userBank;

            if (data.mora >= amountLeftToPay) {
                data.mora -= amountLeftToPay;
            } else {
                amountLeftToPay -= data.mora;
                data.mora = 0;
                data.bank -= amountLeftToPay;
            }

            try {
                await db.query('BEGIN');
                await client.setLevel(data);
                await db.query("DELETE FROM user_loans WHERE id = $1", [loan.id]);
                await db.query('COMMIT');
                
                return replySuccess(`🎉 **تم سداد القرض بالكامل!**\nلقد قمت بسداد مبكر وحصلت على خصم **${discountAmount.toLocaleString()}** ${EMOJI_MORA} (50% من الفائدة المتبقية).\nدفعت: **${finalPayoffAmount.toLocaleString()}** ${EMOJI_MORA}.`); 
            } catch (e) {
                await db.query('ROLLBACK');
                return replyInfo(`❌ حدث خطأ داخلي أثناء السداد.`);
            }
        }

        const amountToPay = parseInt(amountArg.replace(/,/g, ''));
        if (isNaN(amountToPay) || amountToPay <= 0) {
            return replyInfo(`❌ الرجاء إدخال مبلغ صحيح للسداد.`); 
        }

        if (totalBalance < amountToPay) {
            return replyInfo(`❌ لا تملك هذا المبلغ في الكاش أو البنك. (إجمالي رصيدك: **${totalBalance.toLocaleString()}** ${EMOJI_MORA})`); 
        }

        data.mora = userMora;
        data.bank = userBank;

        if (amountToPay >= remainingAmount) {
            const amountToDeduct = remainingAmount;
            const change = amountToPay - remainingAmount;

            let amountLeftToDeduct = amountToDeduct;
            if (data.mora >= amountLeftToDeduct) {
                data.mora -= amountLeftToDeduct;
            } else {
                amountLeftToDeduct -= data.mora;
                data.mora = 0;
                data.bank -= amountLeftToDeduct;
            }

            data.mora += change;

            try {
                await db.query('BEGIN');
                await client.setLevel(data);
                await db.query("DELETE FROM user_loans WHERE id = $1", [loan.id]);
                await db.query('COMMIT');
                return replySuccess(`✅ تم سداد القرض بالكامل. تم إرجاع الباقي (**${change.toLocaleString()}** ${EMOJI_MORA}) إلى رصيدك.`); 
            } catch(e) {
                await db.query('ROLLBACK');
                return replyInfo(`❌ حدث خطأ داخلي أثناء السداد.`);
            }
        }

        let amountLeftToDeduct = amountToPay;
        if (data.mora >= amountLeftToDeduct) {
            data.mora -= amountLeftToDeduct;
        } else {
            amountLeftToDeduct -= data.mora;
            data.mora = 0;
            data.bank -= amountLeftToDeduct;
        }

        remainingAmount -= amountToPay;

        try {
            await db.query('BEGIN');
            await db.query("UPDATE user_loans SET remainingAmount = $1 WHERE id = $2", [remainingAmount, loan.id]);
            await client.setLevel(data);
            await db.query('COMMIT');
            replySuccess(`✅ تم دفع **${amountToPay.toLocaleString()}** ${EMOJI_MORA}.\nالمبلغ المتبقي للقرض: **${remainingAmount.toLocaleString()}** ${EMOJI_MORA}.`); 
        } catch(e) {
            await db.query('ROLLBACK');
            return replyInfo(`❌ حدث خطأ داخلي أثناء السداد.`);
        }
    }
};
