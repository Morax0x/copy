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
        let interaction, message, guild, client, sender, senderMember, sql;
        let receiver, amount;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            sql = client.sql; 
            sender = interaction.user;
            senderMember = interaction.member;
            receiver = interaction.options.getMember('المستلم');
            amount = interaction.options.getInteger('المبلغ');
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            sql = client.sql; 
            sender = message.author;
            senderMember = message.member;
            receiver = message.mentions.members.first();
            amount = parseInt(args[1]);
        }

        // دوال مساعدة للرد
        const reply = async (payload) => {
            if (isSlash) {
                // إذا تم الرد مسبقاً نستخدم editReply
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

        // 1. التحقق من المدخلات
        if (!receiver || isNaN(amount) || amount <= 0) {
            return replyError(`طريقة التحويل الصحيحة:\n- \`تحويل <@user> <المبلغ>\``);
        }

        if (receiver.id === sender.id) {
            return replyError("لا يمكنك التحويل لنفسك!");
        }

        if (receiver.user.bot) {
            return replyError("لا يمكنك التحويل للبوتات!");
        }

        // 2. تحديث قاعدة البيانات (لضمان وجود أعمدة التتبع اليومي)
        try {
            sql.prepare("ALTER TABLE levels ADD COLUMN lastTransferDate TEXT DEFAULT ''").run();
            sql.prepare("ALTER TABLE levels ADD COLUMN dailyTransferCount INTEGER DEFAULT 0").run();
        } catch (e) {}

        const getScore = client.getLevel;
        
        let senderData = getScore.get(sender.id, guild.id);
        if (!senderData) senderData = { ...client.defaultData, user: sender.id, guild: guild.id };

        // 3. فحص القرض
        const loanData = sql.prepare("SELECT remainingAmount FROM user_loans WHERE userID = ? AND guildID = ?").get(sender.id, guild.id);
        if (loanData && loanData.remainingAmount > 0) {
            return replyError(`❌ **عذراً!** عليك قرض بقيمة **${loanData.remainingAmount.toLocaleString()}** مورا.\nيجب سداد القرض بالكامل قبل أن تتمكن من تحويل الأموال.`);
        }

        // 4. فحص الكولداون (الوقت بين التحويلات)
        const now = Date.now();
        const timeLeft = (senderData.lastTransfer || 0) + COOLDOWN_MS - now;
        if (timeLeft > 0) {
            const minutes = Math.floor(timeLeft / 60000);
            const seconds = Math.floor((timeLeft % 60000) / 1000);
            return replyError(`🕐 يمكنك التحويل مرة كل 5 دقائق. يرجى الانتظار **${minutes} دقيقة و ${seconds} ثانية**.`);
        }

        // 5. التحقق من الرصيد
        if (senderData.mora < amount) {
            return replyError(`ليس لديك مورا كافية لإتمام هذا التحويل! (رصيدك: ${senderData.mora.toLocaleString()})`);
        }

        // 6. حساب الضريبة بناءً على توقيت السعودية
        // الحصول على تاريخ اليوم بتوقيت السعودية (YYYY-MM-DD)
        const saudiDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());

        // تصفير العداد إذا كان اليوم مختلف
        if (senderData.lastTransferDate !== saudiDate) {
            senderData.dailyTransferCount = 0;
            senderData.lastTransferDate = saudiDate;
        }

        // تحديد نسبة الضريبة
        let currentTaxRate = BASE_TAX_RATE; // الافتراضي 3%
        let isFree = false;

        if (senderData.dailyTransferCount === 0) {
            currentTaxRate = 0; // أول تحويل مجاني
            isFree = true;
        }

        const taxAmount = Math.floor(amount * currentTaxRate);
        const amountReceived = amount - taxAmount;

        // 7. إنشاء رسالة التأكيد والأزرار
        const confirmEmbed = new EmbedBuilder()
            .setColor("#F1C40F") // أصفر للتحذير/الانتظار
            .setTitle('⚠️ تأكيد التحويل')
            .setDescription(`سيـتـم تحويـل **${amount.toLocaleString()}** <:mora:1435647151349698621> إلى ${receiver}\n\n**تفاصيل العملية:**\n• المبلغ: ${amount.toLocaleString()}\n• الضريبة (${isFree ? 'مجاني' : '3%'}): ${taxAmount.toLocaleString()}\n• سيصل للمستلم: **${amountReceived.toLocaleString()}**`)
            .setFooter({ text: isFree ? "💡 هذا هو تحويلك اليومي المجاني!" : "💡 لقد استهلكت تحويلك المجاني اليوم." });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('confirm_transfer')
                .setLabel('تـأكيد')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('cancel_transfer')
                .setLabel('الغـاء')
                .setStyle(ButtonStyle.Danger)
        );

        const msgResponse = await reply({ embeds: [confirmEmbed], components: [row], fetchReply: true });

        // 8. التعامل مع الأزرار
        const collector = msgResponse.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 30000, // 30 ثانية للتأكيد
            filter: (i) => i.user.id === sender.id
        });

        collector.on('collect', async (i) => {
            if (i.customId === 'cancel_transfer') {
                await i.update({ content: "❌ **تم إلغاء عملية التحويل.**", embeds: [], components: [] });
                return collector.stop('cancelled');
            }

            if (i.customId === 'confirm_transfer') {
                // إعادة التحقق من الرصيد (لتجنب الثغرات أثناء الانتظار)
                const freshData = client.getLevel.get(sender.id, guild.id);
                if (!freshData || freshData.mora < amount) {
                    await i.update({ content: "❌ **فشلت العملية:** لم يعد لديك رصيد كافي.", embeds: [], components: [] });
                    return collector.stop('no_money');
                }

                let receiverData = client.getLevel.get(receiver.id, guild.id);
                if (!receiverData) {
                    receiverData = { ...client.defaultData, user: receiver.id, guild: guild.id };
                }

                // تنفيذ الخصم والإضافة
                freshData.mora -= amount;
                freshData.lastTransfer = Date.now();
                
                // تحديث عداد التحويلات اليومي والتاريخ
                freshData.dailyTransferCount = (freshData.dailyTransferCount || 0) + 1;
                freshData.lastTransferDate = saudiDate;

                receiverData.mora = (receiverData.mora || 0) + amountReceived;

                client.setLevel.run(freshData);
                client.setLevel.run(receiverData);

                // رسالة النجاح
                const successEmbed = new EmbedBuilder()
                    .setColor("Green") // أخضر للنجاح
                    .setTitle('✅ تـم التـحويـل بنجـاح')
                    .setDescription([
                        `**المرسل:** ${sender.username}`,
                        `**المستلم:** ${receiver.user.username}`,
                        `\n**المبلغ المُرسل:** ${amount.toLocaleString()} <:mora:1435647151349698621>`,
                        `**الضريبة (${isFree ? '0%' : '3%'}):** ${taxAmount.toLocaleString()} <:mora:1435647151349698621>`,
                        `**المبلغ المستلم:** ${amountReceived.toLocaleString()} <:mora:1435647151349698621>`
                    ].join('\n'))
                    .setImage('https://i.postimg.cc/vHhJTgyx/download-3.jpg')
                    .setTimestamp();

                await i.update({ content: null, embeds: [successEmbed], components: [] });
                collector.stop('success');
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                if (isSlash) {
                    await interaction.editReply({ content: "⏰ **انتهى وقت التأكيد، تم إلغاء التحويل.**", embeds: [], components: [] }).catch(() => {});
                } else {
                    await msgResponse.edit({ content: "⏰ **انتهى وقت التأكيد، تم إلغاء التحويل.**", embeds: [], components: [] }).catch(() => {});
                }
            }
        });
    }
};
