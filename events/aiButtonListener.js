const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const aiLimitHandler = require('../utils/aiLimitHandler');
const aiConfig = require('../utils/aiConfig');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        if (!interaction.isButton()) return;

        // 🔥🔥 التعديل الحاسم: نتأكد أن الز.ر يخص الذكاء الاصطناعي فقط 🔥🔥
        // إذا الزر مو تبعنا (مثل زر الباك اب)، نترك الملف فوراً ولا نتدخل
        if (!interaction.customId.startsWith('ai_')) return;

        // 🚫 الآن نطبق منع الخاص (فقط لأزرارنا)
        if (!interaction.guild) {
            return interaction.reply({ content: "❌ أوامر الذكاء الاصطناعي تعمل داخل السيرفرات فقط.", ephemeral: true });
        }

        // حماية إضافية
        if (!interaction.user) return; 

        const userID = interaction.user.id;
        const guildID = interaction.guild.id;

        // =========================================================
        // 1. 💰 زر شحن رصيد الرسائل (Top-up Limit)
        // =========================================================
        if (interaction.customId === 'ai_topup_2500') {
            await interaction.deferReply({ ephemeral: true });

            const COST = 2500;
            const REWARD_MESSAGES = 100;

            let userData = interaction.client.getLevel ? interaction.client.getLevel.get(userID, guildID) : null;
            if (!userData && interaction.client.defaultData) {
                userData = { ...interaction.client.defaultData, user: userID, guild: guildID };
            }

            if ((userData?.mora || 0) < COST) {
                return interaction.editReply({
                    content: `🚫 **عذراً، رصيدك غير كافٍ!**\nتحتاج إلى **${COST}** مورا، وأنت تملك **${userData?.mora || 0}** فقط.`
                });
            }

            userData.mora -= COST;
            if (interaction.client.setLevel) interaction.client.setLevel.run(userData);

            aiLimitHandler.addPurchasedBalance(userID, REWARD_MESSAGES);

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ تمت عملية الشحن')
                .setDescription(`💎 **تم خصم ${COST} مورا.**\n🤖 **تمت إضافة ${REWARD_MESSAGES} رسالة لرصيد محادثتك.**\n\nاستمتع بوقتك!`)
                .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() });

            await interaction.editReply({ embeds: [embed] });
        }

        // =========================================================
        // 2. 🔓 زر دفع لفتح الكتاغوري (Pay Category Unlock)
        // =========================================================
        if (interaction.customId === 'ai_pay_category_1000') {
            await interaction.deferReply({ ephemeral: true });

            const COST = 1000;
            let userData = interaction.client.getLevel ? interaction.client.getLevel.get(userID, guildID) : null;
            if (!userData && interaction.client.defaultData) {
                userData = { ...interaction.client.defaultData, user: userID, guild: guildID };
            }

            if ((userData?.mora || 0) < COST) {
                return interaction.editReply({
                    content: `❌ **طفرت؟** ما معك **${COST}** مورا عشان تفتح الشات.`
                });
            }

            userData.mora -= COST;
            if (interaction.client.setLevel) interaction.client.setLevel.run(userData);

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

        // =========================================================
        // 3. 🎭 زر اختيار الوضع (تفعيل القناة)
        // =========================================================
        if (interaction.customId === 'ai_mode_select_sfw' || interaction.customId === 'ai_mode_select_nsfw') {
            await interaction.deferUpdate();

            const mode = interaction.customId.includes('nsfw') ? 'NSFW' : 'SFW';
            aiConfig.setPaidChannel(guildID, interaction.channel.id, mode);

            await interaction.editReply({
                content: `🔓 **تم تفعيل الشات بوضع ${mode}!**\nاستمتعوا لمدة 24 ساعة مع الإمبراطورة. ⏳`,
                components: [] 
            });
        }
    }
};
