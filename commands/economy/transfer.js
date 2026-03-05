const { EmbedBuilder, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");

let updateGuildStat;
try {
    ({ updateGuildStat } = require('../../handlers/guild-board-handler.js'));
} catch (e) {}

const BASE_TAX_RATE = 0.03; 
const COOLDOWN_MS = 5 * 60 * 1000; 

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
        let interaction, message, guild, client, sender, db, senderMember;
        let receiver, amount;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            db = client.sql; 
            sender = interaction.user;
            senderMember = interaction.member;
            receiver = interaction.options.getMember('المستلم');
            amount = interaction.options.getInteger('المبلغ');
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            db = client.sql; 
            sender = message.author;
            senderMember = message.member;
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

        if (!client.activePlayers) client.activePlayers = new Set();

        if (client.activePlayers.has(sender.id)) {
            return replyError("🚫 **لا يمكنك التحويل الآن!** أنت مشغول في لعبة أخرى أو لديك عملية معلقة.");
        }

        if (!receiver || isNaN(amount) || amount <= 0) {
            return replyError(`طريقة التحويل الصحيحة:\n- \`تحويل <@user> <المبلغ>\``);
        }

        if (receiver.id === sender.id) return replyError("لا يمكنك التحويل لنفسك!");
        if (receiver.user.bot) return replyError("لا يمكنك التحويل للبوتات!");

        try {
            await db.query("ALTER TABLE levels ADD COLUMN IF NOT EXISTS lastTransferDate TEXT DEFAULT ''");
            await db.query("ALTER TABLE levels ADD COLUMN IF NOT EXISTS dailyTransferCount BIGINT DEFAULT 0");
        } catch (e) {}

        let senderData = await client.getLevel(sender.id, guild.id);
        if (!senderData) senderData = { ...client.defaultData, user: sender.id, guild: guild.id };

        try {
            const loanRes = await db.query("SELECT remainingAmount FROM user_loans WHERE userID = $1 AND guildID = $2", [sender.id, guild.id]);
            const loanData = loanRes.rows[0];
            if (loanData && Number(loanData.remainingamount || loanData.remainingAmount) > 0) {
                return replyError(`❌ **عذراً!** عليك قرض بقيمة **${Number(loanData.remainingamount || loanData.remainingAmount).toLocaleString()}** مورا.`);
            }
        } catch (e) {}

        const now = Date.now();
        const timeLeft = (Number(senderData.lastTransfer) || 0) + COOLDOWN_MS - now;
        if (timeLeft > 0) {
            const minutes = Math.floor(timeLeft / 60000);
            const seconds = Math.floor((timeLeft % 60000) / 1000);
            return replyError(`🕐 يرجى الانتظار **${minutes} دقيقة و ${seconds} ثانية**.`);
        }

        if (Number(senderData.mora) < amount) return replyError(`ليس لديك مورا كافية! (رصيدك: ${Number(senderData.mora).toLocaleString()})`);

        let isPhilanthropistKing = false;
        try {
            const settingsRes = await db.query("SELECT rolePhilanthropist FROM settings WHERE guild = $1", [guild.id]);
            const settings = settingsRes.rows[0];
            const roleId = settings?.rolephilanthropist || settings?.rolePhilanthropist;
            if (roleId && senderMember.roles.cache.has(roleId)) {
                isPhilanthropistKing = true;
            }
        } catch(e) {}

        const saudiDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
        let tempDailyCount = Number(senderData.dailyTransferCount || senderData.dailytransfercount) || 0;
        if (senderData.lastTransferDate !== saudiDate && senderData.lasttransferdate !== saudiDate) tempDailyCount = 0;
        
        let displayTaxRate = (tempDailyCount === 0 || isPhilanthropistKing) ? 0 : BASE_TAX_RATE;
        const displayTaxAmount = Math.floor(amount * displayTaxRate);
        const displayAmountReceived = amount - displayTaxAmount;

        let footerText = "💡 استهلكت تحويلك المجاني اليوم.";
        if (isPhilanthropistKing) {
            footerText = "👑 إعفاء ملك الكرم: تحويل مجاني بلا رسوم!";
        } else if (tempDailyCount === 0) {
            footerText = "💡 هذا هو تحويلك اليومي المجاني!";
        }

        const confirmEmbed = new EmbedBuilder()
            .setColor("#F1C40F")
            .setTitle('⚠️ تأكيد التحويل')
            .setDescription(`سيـتـم تحويـل **${amount.toLocaleString()}** <:mora:1435647151349698621> إلى ${receiver}\n\n**تفاصيل العملية:**\n• المبلغ: ${amount.toLocaleString()}\n• الضريبة (${displayTaxRate === 0 ? 'مجاني' : '3%'}): ${displayTaxAmount.toLocaleString()}\n• سيصل للمستلم: **${displayAmountReceived.toLocaleString()}**`)
            .setFooter({ text: footerText });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('confirm_transfer').setLabel('تـأكيد').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('cancel_transfer').setLabel('الغـاء').setStyle(ButtonStyle.Danger)
        );

        client.activePlayers.add(sender.id);

        const msgResponse = await reply({ embeds: [confirmEmbed], components: [row], fetchReply: true });

        const collector = msgResponse.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 30000,
            filter: (i) => i.user.id === sender.id
        });

        const unlockPlayer = () => {
            if (client.activePlayers.has(sender.id)) {
                client.activePlayers.delete(sender.id);
            }
        };

        collector.on('collect', async (i) => {
            if (i.customId === 'cancel_transfer') {
                unlockPlayer(); 
                await i.update({ content: "❌ **تم إلغاء عملية التحويل.**", embeds: [], components: [] });
                return collector.stop('cancelled');
            }

            if (i.customId === 'confirm_transfer') {
                let freshSenderData = await client.getLevel(sender.id, guild.id);
                
                if (!freshSenderData || Number(freshSenderData.mora) < amount) {
                    unlockPlayer(); 
                    await i.update({ content: "❌ **فشلت العملية:** لم يعد لديك رصيد كافي.", embeds: [], components: [] });
                    return collector.stop('no_money');
                }

                const currentSaudiDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
                if (freshSenderData.lastTransferDate !== currentSaudiDate && freshSenderData.lasttransferdate !== currentSaudiDate) {
                    freshSenderData.dailyTransferCount = 0;
                    freshSenderData.lastTransferDate = currentSaudiDate;
                }

                let realTaxRate = BASE_TAX_RATE;
                let isFree = false;
                if ((Number(freshSenderData.dailyTransferCount || freshSenderData.dailytransfercount) || 0) === 0 || isPhilanthropistKing) {
                    realTaxRate = 0;
                    isFree = true;
                }

                const realTaxAmount = Math.floor(amount * realTaxRate);
                const realAmountReceived = amount - realTaxAmount;

                freshSenderData.mora = Number(freshSenderData.mora) - amount;
                freshSenderData.dailyTransferCount = (Number(freshSenderData.dailyTransferCount || freshSenderData.dailytransfercount) || 0) + 1;
                freshSenderData.lastTransfer = Date.now();

                try {
                    await db.query('BEGIN');
                    await client.setLevel(freshSenderData); 

                    let receiverData = await client.getLevel(receiver.id, guild.id);
                    if (!receiverData) receiverData = { ...client.defaultData, user: receiver.id, guild: guild.id };
                    receiverData.mora = (Number(receiverData.mora) || 0) + realAmountReceived;
                    await client.setLevel(receiverData);
                    await db.query('COMMIT');
                } catch (e) {
                    await db.query('ROLLBACK');
                    unlockPlayer();
                    await i.update({ content: "❌ **فشلت العملية:** خطأ في قاعدة البيانات.", embeds: [], components: [] });
                    return collector.stop('error');
                }

                if (updateGuildStat) {
                    updateGuildStat(client, guild.id, sender.id, 'mora_donated', amount);
                }

                unlockPlayer(); 

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
                unlockPlayer(); 
                const timeoutMsg = { content: "⏰ **انتهى وقت التأكيد، تم إلغاء التحويل.**", embeds: [], components: [] };
                if (isSlash) await interaction.editReply(timeoutMsg).catch(() => {});
                else await msgResponse.edit(timeoutMsg).catch(() => {});
            }
        });
    }
};
