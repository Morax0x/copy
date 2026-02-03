// commands/economy/transfer.js

const { EmbedBuilder, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");

const BASE_TAX_RATE = 0.03; // ضريبة 3% للتحويلات التالية
const COOLDOWN_MS = 5 * 60 * 1000; // 5 دقائق

module.exports = {
    data: new SlashCommandBuilder()
        .setName('تحويل')
        .setDescription('تحول مورا إلى عضو آخر (أول تحويل يومياً مجاني، الباقي 3%).')
        .addUserOption(option =>
            option.setName('المستلم')
            .setDescription('العضو الذي تريد التحويل له')
            .setRequired(true))
        .addIntegerOption(option =>
            option.setName('المبلغ')
            .setDescription('المبلغ الذي تريد تحويله')
            .setRequired(true)
            .setMinValue(1)),

    name: 'transfer',
    aliases: ['تحويل', 'c'],
    category: "Economy",
    description: 'تحول مورا إلى عضو آخر.',

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, sender, sql;
        let receiver, amount;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            sql = client.sql; 
            sender = interaction.user;
            receiver = interaction.options.getMember('المستلم');
            amount = interaction.options.getInteger('المبلغ');
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            sql = client.sql; 
            sender = message.author;
            receiver = message.mentions.members.first();
            amount = parseInt(args[1]);
        }

        const reply = async (payload) => {
            if (isSlash) {
                if (interaction.replied || interaction.deferred) return interaction.editReply(payload);
                return interaction.reply(payload);
            } else {
                return message.channel.send(payload);
            }
        };

        const replyError = async (content) => {
            const payload = { content, ephemeral: true };
            if (isSlash) {
                if (interaction.replied || interaction.deferred) return interaction.editReply(payload);
                return interaction.reply(payload);
            } else {
                return message.reply(payload);
            }
        };

        // 🛡️ تهيئة قائمة اللاعبين النشطين
        if (!client.activePlayers) client.activePlayers = new Set();

        // 🛡️ 1. الحماية: التحقق مما إذا كان اللاعب مشغولاً
        if (client.activePlayers.has(sender.id)) {
            return replyError("🚫 **لا يمكنك التحويل الآن!** أنت مشغول في لعبة أخرى أو لديك عملية معلقة.");
        }

        if (!receiver || isNaN(amount) || amount <= 0) {
            return replyError(`طريقة التحويل الصحيحة:\n- \`تحويل <@user> <المبلغ>\``);
        }

        if (receiver.id === sender.id) return replyError("لا يمكنك التحويل لنفسك!");
        if (receiver.user.bot) return replyError("لا يمكنك التحويل للبوتات!");

        // Ensure DB columns exist
        try {
            sql.prepare("ALTER TABLE levels ADD COLUMN lastTransferDate TEXT DEFAULT ''").run();
            sql.prepare("ALTER TABLE levels ADD COLUMN dailyTransferCount INTEGER DEFAULT 0").run();
        } catch (e) {}

        const getScore = client.getLevel;
        let senderData = getScore.get(sender.id, guild.id);
        if (!senderData) senderData = { ...client.defaultData, user: sender.id, guild: guild.id };

        // Check Loan
        const loanData = sql.prepare("SELECT remainingAmount FROM user_loans WHERE userID = ? AND guildID = ?").get(sender.id, guild.id);
        if (loanData && loanData.remainingAmount > 0) {
            return replyError(`❌ **عذراً!** عليك قرض بقيمة **${loanData.remainingAmount.toLocaleString()}** مورا.`);
        }

        // Check Cooldown
        const now = Date.now();
        const timeLeft = (senderData.lastTransfer || 0) + COOLDOWN_MS - now;
        if (timeLeft > 0) {
            const minutes = Math.floor(timeLeft / 60000);
            const seconds = Math.floor((timeLeft % 60000) / 1000);
            return replyError(`🕐 يرجى الانتظار **${minutes} دقيقة و ${seconds} ثانية**.`);
        }

        if (senderData.mora < amount) return replyError(`ليس لديك مورا كافية! (رصيدك: ${senderData.mora.toLocaleString()})`);

        // Display Logic (Initial Calculation for User View only)
        const saudiDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
        let tempDailyCount = senderData.dailyTransferCount || 0;
        if (senderData.lastTransferDate !== saudiDate) tempDailyCount = 0;
        
        let displayTaxRate = (tempDailyCount === 0) ? 0 : BASE_TAX_RATE;
        const displayTaxAmount = Math.floor(amount * displayTaxRate);
        const displayAmountReceived = amount - displayTaxAmount;

        const confirmEmbed = new EmbedBuilder()
            .setColor("#F1C40F")
            .setTitle('⚠️ تأكيد التحويل')
            .setDescription(`سيـتـم تحويـل **${amount.toLocaleString()}** <:mora:1435647151349698621> إلى ${receiver}\n\n**تفاصيل العملية:**\n• المبلغ: ${amount.toLocaleString()}\n• الضريبة (${displayTaxRate === 0 ? 'مجاني' : '3%'}): ${displayTaxAmount.toLocaleString()}\n• سيصل للمستلم: **${displayAmountReceived.toLocaleString()}**`)
            .setFooter({ text: (displayTaxRate === 0) ? "💡 هذا هو تحويلك اليومي المجاني!" : "💡 لقد استهلكت تحويلك المجاني اليوم." });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('confirm_transfer').setLabel('تـأكيد').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('cancel_transfer').setLabel('الغـاء').setStyle(ButtonStyle.Danger)
        );

        // 🛡️ 2. الحماية: قفل اللاعب عند بدء التأكيد
        client.activePlayers.add(sender.id);

        const msgResponse = await reply({ embeds: [confirmEmbed], components: [row], fetchReply: true });

        const collector = msgResponse.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 30000,
            filter: (i) => i.user.id === sender.id
        });

        // دالة لتحرير اللاعب
        const unlockPlayer = () => {
            if (client.activePlayers.has(sender.id)) {
                client.activePlayers.delete(sender.id);
            }
        };

        collector.on('collect', async (i) => {
            if (i.customId === 'cancel_transfer') {
                unlockPlayer(); // 🔓 تحرير
                await i.update({ content: "❌ **تم إلغاء عملية التحويل.**", embeds: [], components: [] });
                return collector.stop('cancelled');
            }

            if (i.customId === 'confirm_transfer') {
                // 🔥 إعادة جلب البيانات والتحقق النهائي
                const freshSenderData = client.getLevel.get(sender.id, guild.id);
                
                if (!freshSenderData || freshSenderData.mora < amount) {
                    unlockPlayer(); // 🔓 تحرير
                    await i.update({ content: "❌ **فشلت العملية:** لم يعد لديك رصيد كافي.", embeds: [], components: [] });
                    return collector.stop('no_money');
                }

                const currentSaudiDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
                if (freshSenderData.lastTransferDate !== currentSaudiDate) {
                    freshSenderData.dailyTransferCount = 0;
                    freshSenderData.lastTransferDate = currentSaudiDate;
                }

                let realTaxRate = BASE_TAX_RATE;
                let isFree = false;
                if ((freshSenderData.dailyTransferCount || 0) === 0) {
                    realTaxRate = 0;
                    isFree = true;
                }

                const realTaxAmount = Math.floor(amount * realTaxRate);
                const realAmountReceived = amount - realTaxAmount;

                // 🛡️ 3. الحماية: الخصم والحفظ للمرسل أولاً (Atomic-like)
                freshSenderData.mora -= amount;
                freshSenderData.dailyTransferCount = (freshSenderData.dailyTransferCount || 0) + 1;
                freshSenderData.lastTransfer = Date.now();
                client.setLevel.run(freshSenderData); 

                // 🛡️ 4. الحماية: إضافة المبلغ للمستلم وحفظه بعد نجاح الخصم
                let receiverData = client.getLevel.get(receiver.id, guild.id);
                if (!receiverData) receiverData = { ...client.defaultData, user: receiver.id, guild: guild.id };
                receiverData.mora = (receiverData.mora || 0) + realAmountReceived;
                client.setLevel.run(receiverData);

                // 5. فتح القفل وإرسال النجاح
                unlockPlayer(); // 🔓 تحرير

                const successEmbed = new EmbedBuilder()
                    .setColor("Green")
                    .setTitle('✅ تـم التـحويـل بنجـاح')
                    .setDescription([
                        `**المرسل:** ${sender.username}`,
                        `**المستلم:** ${receiver.user.username}`,
                        `\n**المبلغ المُرسل:** ${amount.toLocaleString()} <:mora:1435647151349698621>`,
                        `**الضريبة (${isFree ? '0%' : '3%'}):** ${realTaxAmount.toLocaleString()} <:mora:1435647151349698621>`,
                        `**المبلغ المستلم:** ${realAmountReceived.toLocaleString()} <:mora:1435647151349698621>`
                    ].join('\n'))
                    .setImage('https://i.postimg.cc/vHhJTgyx/download-3.jpg')
                    .setTimestamp();

                await i.update({ content: null, embeds: [successEmbed], components: [] });
                collector.stop('success');
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                unlockPlayer(); // 🔓 تحرير عند انتهاء الوقت
                const timeoutMsg = { content: "⏰ **انتهى وقت التأكيد، تم إلغاء التحويل.**", embeds: [], components: [] };
                if (isSlash) await interaction.editReply(timeoutMsg).catch(() => {});
                else await msgResponse.edit(timeoutMsg).catch(() => {});
            }
        });
    }
};
