const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const aiLimitHandler = require('../utils/aiLimitHandler');
const aiConfig = require('../utils/aiConfig');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        if (!interaction.isButton()) return;
        if (!interaction.customId.startsWith('ai_')) return;

        if (!interaction.guild) {
            return interaction.reply({ content: "❌ أوامر الذكاء الاصطناعي تعمل داخل السيرفرات فقط.", flags: [MessageFlags.Ephemeral] });
        }

        const userID = interaction.user.id;
        const guildID = interaction.guild.id;
        const db = interaction.client.sql;

        try {
            if (interaction.customId === 'ai_topup_2500') {
                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

                const COST = 2500;
                const REWARD_MESSAGES = 100;

                const res = await db.query('SELECT mora FROM levels WHERE "user" = $1 AND guild = $2', [userID, guildID]);
                let userMora = res.rows.length > 0 ? res.rows[0].mora : 0;

                if (userMora < COST) {
                    return interaction.editReply({
                        content: `🚫 **عذراً، رصيدك غير كافٍ!**\nتحتاج إلى **${COST}** مورا، وأنت تملك **${userMora}** فقط.`
                    });
                }

                await db.query('UPDATE levels SET mora = mora - $1 WHERE "user" = $2 AND guild = $3', [COST, userID, guildID]);

                aiLimitHandler.addPurchasedBalance(userID, REWARD_MESSAGES);

                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('✅ تمت عملية الشحن')
                    .setDescription(`💎 **تم خصم ${COST} مورا.**\n🤖 **تمت إضافة ${REWARD_MESSAGES} رسالة لرصيد محادثتك.**\n\nاستمتع بوقتك!`)
                    .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() });

                await interaction.editReply({ embeds: [embed] });
            }

            else if (interaction.customId === 'ai_pay_category_1000') {
                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

                const COST = 1000;
                const res = await db.query('SELECT mora FROM levels WHERE "user" = $1 AND guild = $2', [userID, guildID]);
                let userMora = res.rows.length > 0 ? res.rows[0].mora : 0;

                if (userMora < COST) {
                    return interaction.editReply({
                        content: `❌ **طفرت؟** ما معك **${COST}** مورا عشان تفتح الشات.`
                    });
                }

                await db.query('UPDATE levels SET mora = mora - $1 WHERE "user" = $2 AND guild = $3', [COST, userID, guildID]);

                const modeButtons = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('ai_mode_select_sfw').setLabel('SFW (عادية)').setStyle(ButtonStyle.Success).setEmoji('🛡️'),
                    new ButtonBuilder().setCustomId('ai_mode_select_nsfw').setLabel('NSFW (منحرفة)').setStyle(ButtonStyle.Danger).setEmoji('🔥')
                );

                await interaction.editReply({ content: "✅ تم الدفع! اختر الوضع من الرسالة أدناه 👇" });

                await interaction.channel.send({
                    content: `✅ **تم دفع ${COST} مورا من قبل ${interaction.user}!**\nالآن اختر شخصيتي لهذا اليوم (لمدة 24 ساعة):`,
                    components: [modeButtons]
                });
            }

            else if (interaction.customId === 'ai_mode_select_sfw' || interaction.customId === 'ai_mode_select_nsfw') {
                await interaction.deferUpdate();

                const mode = interaction.customId.includes('nsfw') ? 'NSFW' : 'SFW';
                
                aiConfig.setPaidChannel(guildID, interaction.channel.id, mode);

                await interaction.editReply({
                    content: `🔓 **تم تفعيل الشات بوضع ${mode}!**\nاستمتعوا لمدة 24 ساعة مع الإمبراطورة. ⏳`,
                    components: [] 
                });
            }

        } catch (error) {
            console.error('[AI Button Error]', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ حدث خطأ أثناء معالجة الطلب.', flags: [MessageFlags.Ephemeral] });
            } else {
                await interaction.followUp({ content: '❌ حدث خطأ أثناء معالجة الطلب.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
            }
        }
    }
};
