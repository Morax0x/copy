const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, SlashCommandBuilder, MessageFlags } = require("discord.js");
const EMOJI_MORA = '<:mora:1435647151349698621>';

const LOANS = [
    { id: 'loan_5000', label: 'قرض 5,000', amount: 5000, requiredLevel: 5, totalToRepay: 5500, dailyPayment: 184 },
    { id: 'loan_15000', label: 'قرض 15,000', amount: 15000, requiredLevel: 20, totalToRepay: 16500, dailyPayment: 550 },
    { id: 'loan_30000', label: 'قرض 30,000', amount: 30000, requiredLevel: 30, totalToRepay: 33000, dailyPayment: 1100 }
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('قرض')
        .setDescription('الحصول على قرض من البنك.'),

    name: 'loan',
    aliases: ['قرض'],
    category: "Economy",
    description: 'الحصول على قرض من البنك.',

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, client, sql, user, member, guild;

        try {
            if (isSlash) {
                interaction = interactionOrMessage;
                client = interaction.client;
                sql = client.sql;
                user = interaction.user;
                member = interaction.member;
                guild = interaction.guild;
                await interaction.deferReply();
            } else {
                message = interactionOrMessage;
                client = message.client;
                sql = client.sql;
                user = message.author;
                member = message.member;
                guild = message.guild;
            }

            const sendReply = async (payload) => {
                if (isSlash) {
                    return interaction.editReply(payload);
                } else {
                    return message.reply(payload);
                }
            };

            const sendError = async (content) => {
                const payload = { content, ephemeral: true };
                if (isSlash) {
                    return interaction.editReply(payload);
                } else {
                    return message.reply(payload);
                }
            };


            const getLoanRes = await sql.query(`SELECT * FROM user_loans WHERE "userID" = $1 AND "guildID" = $2 AND "remainingAmount" > 0`, [user.id, guild.id]);
            const existingLoan = getLoanRes.rows[0];

            if (existingLoan) {
                return sendError(`❌ لديك قرض سابق لم تقم بسداده. المبلغ المتبقي: **${Number(existingLoan.remainingAmount || existingLoan.remainingamount).toLocaleString()}** ${EMOJI_MORA}.`);
            }

            const mainEmbed = new EmbedBuilder()
                .setTitle('بنـك الامـبراطـوريـة')
                .setDescription(
                    `✬ اهـلا بك بقسم القـروض اختر القرض الذي يناسبك <a:6aMoney:1439572832219693116>\n` +
                    `✬ جمـيع القـروض بفائـدة 10% وتسداد بشكل آلي على مدار 30 يـوم\n\n` +
                    `✦ تـأكد من مراجعـة عـقد القرض قبـل توقيعـه <:stop:1436337453098340442>`
                )
                .setColor(Colors.Gold)
                .setImage('https://i.postimg.cc/GmQN2JWF/bank.gif'); 

            const mainRow = new ActionRowBuilder();
            LOANS.forEach(loan => {
                mainRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId(loan.id)
                        .setLabel(loan.label)
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji(EMOJI_MORA)
                );
            });

            const msg = await sendReply({ embeds: [mainEmbed], components: [mainRow], fetchReply: true });

            const filter = (i) => i.user.id === user.id;
            const collector = msg.createMessageComponentCollector({ filter, time: 180000 });

            collector.on('collect', async i => {
                try {
                    if (i.customId === 'cancel_loan') {
                        return i.update({ embeds: [mainEmbed], components: [mainRow] });
                    }

                    let data = await client.getLevel(user.id, guild.id);
                    if (!data) data = { ...client.defaultData, user: user.id, guild: guild.id };

                    if (i.customId.startsWith('loan_')) {
                        const selectedLoan = LOANS.find(l => l.id === i.customId);
                        if (!selectedLoan) return;

                        if (Number(data.level) < selectedLoan.requiredLevel) {
                            return i.reply({
                                content: `❌ لا يمكنك أخذ هذا القرض. يتطلب لفل **${selectedLoan.requiredLevel}** وأنت لفل **${data.level}**.`,
                                ephemeral: true
                            });
                        }

                        const confirmationEmbed = new EmbedBuilder()
                            .setTitle(`⚠️ عـقـد الـقـرض: ${selectedLoan.label}`)
                            .setColor(Colors.Red)
                            .setDescription(
                                `✶ مبلـغ القرض: **${selectedLoan.amount.toLocaleString()}** ${EMOJI_MORA}\n` +
                                `✦ قيمـة السداد الكاملة على 30 يوم: **${selectedLoan.totalToRepay.toLocaleString()}** ${EMOJI_MORA}\n` +
                                `✬ مبـلغ القسـط اليومي: **${selectedLoan.dailyPayment.toLocaleString()}** ${EMOJI_MORA}\n\n` +
                                `✶ هـل انـت موافـق علـى توقيـع عقد القرض<:mirkk:1435648219488190525>؟\n\n` +
                                `> **✦ عواقب التخلف عن السداد <:araara:1436297148894412862>:**\n` +
                                `✬ خصم نقاط الخبرة\n` +
                                `✬ الحرمان من استعمال المتجر\n` +
                                `✬ عقوبة 5% على مكاسب الخبرة والمورا\n` +
                                `✬ ان كان لديك اي اصول او ممتلكات بالمزرعة ستصادر لسداد قرضك`
                            );

                        const confirmationRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId(`confirm_${selectedLoan.id}`)
                                .setLabel('✅ تـوقـيع العـقد')
                                .setStyle(ButtonStyle.Success),
                            new ButtonBuilder()
                                .setCustomId('cancel_loan')
                                .setLabel('❌ رفـض القـرض')
                                .setStyle(ButtonStyle.Secondary)
                        );

                        return i.update({ embeds: [confirmationEmbed], components: [confirmationRow] });
                    }

                    if (i.customId.startsWith('confirm_loan_')) {
                        const loanId = i.customId.replace('confirm_', '');
                        const selectedLoan = LOANS.find(l => l.id === loanId);
                        if (!selectedLoan) return;

                        if (Number(data.level) < selectedLoan.requiredLevel) {
                             return i.update({
                                content: `❌ لا يمكنك أخذ هذا القرض. يتطلب لفل **${selectedLoan.requiredLevel}** وأنت لفل **${data.level}**.`,
                                embeds: [], components: []
                            });
                        }

                        // تحقق مزدوج قبل التنفيذ
                        const existingLoanCheckRes = await sql.query(`SELECT * FROM user_loans WHERE "userID" = $1 AND "guildID" = $2 AND "remainingAmount" > 0`, [user.id, guild.id]);
                        const existingLoanCheck = existingLoanCheckRes.rows[0];
                        
                        if (existingLoanCheck) {
                             return i.update({
                                content: `❌ لديك قرض سابق لم تقم بسداده.`,
                                embeds: [], components: []
                            });
                        }

                        // 🔥 التعديل الجوهري: استخدام Transaction لضمان الأمان عبر PostgreSQL 🔥
                        try {
                            await sql.query("BEGIN");
                            
                            // 1. تحديث الرصيد (إضافة المبلغ)
                            data.mora = (Number(data.mora) || 0) + selectedLoan.amount;
                            await client.setLevel(data);

                            // 2. إنشاء سجل القرض
                            await sql.query(`
                                INSERT INTO user_loans ("userID", "guildID", "loanAmount", "remainingAmount", "dailyPayment", "lastPaymentDate", "missedPayments") 
                                VALUES ($1, $2, $3, $4, $5, $6, $7)
                            `, [user.id, guild.id, selectedLoan.amount, selectedLoan.totalToRepay, selectedLoan.dailyPayment, Date.now(), 0]);

                            await sql.query("COMMIT");

                            // تعطيل الأزرار بعد النجاح
                            const disabledRows = [];
                            if (i.message.components && Array.isArray(i.message.components)) {
                                i.message.components.forEach(row => {
                                    const newRow = new ActionRowBuilder();
                                    row.components.forEach(component => {
                                        newRow.addComponents(
                                            ButtonBuilder.from(component).setDisabled(true)
                                        );
                                    });
                                    disabledRows.push(newRow);
                                });
                            }
                            await i.update({ components: disabledRows });

                            await i.followUp({
                                content: `✅ تم استلام قرض بقيمة **${selectedLoan.amount.toLocaleString()}** ${EMOJI_MORA}.\nسيتم خصم **${selectedLoan.dailyPayment}** يومياً لمدة 30 يوما.`
                            });

                            collector.stop();

                        } catch (txError) {
                            await sql.query("ROLLBACK");
                            console.error("Loan Transaction Error:", txError);
                            return i.followUp({ 
                                content: `❌ حدث خطأ في قاعدة البيانات ولم يتم منح القرض. لم يتم خصم أو إضافة أي شيء.`, 
                                ephemeral: true 
                            });
                        }
                    }
                } catch (collectorError) {
                    console.error("خطأ في الكوليكتور الخاص بالقرض:", collectorError);
                    try {
                        await i.followUp({ content: 'حدث خطأ أثناء معالجة طلبك.', ephemeral: true });
                    } catch (e) {}
                }
            });

            collector.on('end', (collected, reason) => {
                if (reason !== 'collect') {
                    const disabledRows = [];
                    if (msg.components && Array.isArray(msg.components)) {
                        msg.components.forEach(row => {
                            const newRow = new ActionRowBuilder();
                            row.components.forEach(component => {
                                newRow.addComponents(
                                    ButtonBuilder.from(component).setDisabled(true)
                                );
                            });
                            disabledRows.push(newRow);
                        });
                    }
                    msg.edit({ components: disabledRows }).catch(() => {});
                }
            });

        } catch (error) {
            console.error("خطأ في أمر القرض (loan):", error);
            const errorPayload = { content: "حدث خطأ أثناء محاولة عرض قائمة القروض.", ephemeral: true };
            if (isSlash) {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(errorPayload);
                } else {
                    await interaction.reply(errorPayload);
                }
            } else {
                message.reply(errorPayload.content);
            }
        }
    }
};
