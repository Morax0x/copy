const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const aiLimitHandler = require('../utils/aiLimitHandler');
const aiConfig = require('../utils/aiConfig');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        // 1. التحقق الأساسي: هل هو زر؟ وهل هو داخل سيرفر؟
        if (!interaction.isButton()) return;
        if (!interaction.guild) {
            return interaction.reply({ content: "❌ هذا الأمر يعمل داخل السيرفرات فقط.", ephemeral: true });
        }
        if (!interaction.user) return; // حماية إضافية

        const userID = interaction.user.id;
        const guildID = interaction.guild.id;

        // ---------------------------------------------------------
        // 1. 💰 زر شحن رصيد الرسائل (Top-up Limit)
        // ---------------------------------------------------------
        if (interaction.customId === 'ai_topup_2500') {
            const COST = 2500;
            const REWARD_MESSAGES = 100;

            // جلب البيانات (مع حماية من الأخطاء)
            let userData = interaction.client.getLevel ? interaction.client.getLevel.get(userID, guildID) : null;
            
            // إذا لم يكن لديه سجل، ننشئ له سجل افتراضي
            if (!userData && interaction.client.defaultData) {
                userData = { ...interaction.client.defaultData, user: userID, guild: guildID };
            } else if (!userData) {
                // حالة نادرة جداً لو الـ defaultData مو موجود
                return interaction.reply({ content: "❌ حدث خطأ في جلب بياناتك.", ephemeral: true });
            }

            // فحص الرصيد
            if ((userData.mora || 0) < COST) {
                return interaction.reply({
                    content: `🚫 **عذراً، رصيدك غير كافٍ!**\nتحتاج إلى **${COST}** مورا، وأنت تملك **${userData.mora || 0}** فقط.`,
                    ephemeral: true
                });
            }

            // خصم المبلغ وحفظ البيانات
            userData.mora -= COST;
            if (interaction.client.setLevel) interaction.client.setLevel.run(userData);

            // إضافة رصيد المحادثة
            aiLimitHandler.addPurchasedBalance(userID, REWARD_MESSAGES);

            // الرد
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ تمت عملية الشحن')
                .setDescription(`💎 **تم خصم ${COST} مورا.**\n🤖 **تمت إضافة ${REWARD_MESSAGES} رسالة لرصيد محادثتك.**\n\nاستمتع بوقتك!`)
                .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() });

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // ---------------------------------------------------------
        // 2. 🔓 زر دفع لفتح الكتاغوري (Pay Category Unlock)
        // ---------------------------------------------------------
        if (interaction.customId === 'ai_pay_category_1000') {
            const COST = 1000;

            let userData = interaction.client.getLevel ? interaction.client.getLevel.get(userID, guildID) : null;
            if (!userData && interaction.client.defaultData) {
                userData = { ...interaction.client.defaultData, user: userID, guild: guildID };
            }

            // فحص الرصيد
            if ((userData.mora || 0) < COST) {
                return interaction.reply({
                    content: `❌ **طفرت؟** ما معك **${COST}** مورا عشان تفتح الشات.`,
                    ephemeral: true
                });
            }

            // خصم المبلغ
            userData.mora -= COST;
            if (interaction.client.setLevel) interaction.client.setLevel.run(userData);

            // عرض أزرار اختيار الوضع
            const modeButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ai_mode_select_sfw').setLabel('SFW (عادية)').setStyle(ButtonStyle.Success).setEmoji('🛡️'),
                new ButtonBuilder().setCustomId('ai_mode_select_nsfw').setLabel('NSFW (منحرفة)').setStyle(ButtonStyle.Danger).setEmoji('🔥')
            );

            // نرسل رسالة عامة ليختار الوضع
            await interaction.reply({
                content: `✅ **تم دفع ${COST} مورا من قبل ${interaction.user}!**\nالآن اختر شخصيتي لهذا اليوم (لمدة 24 ساعة):`,
                components: [modeButtons]
            });
        }

        // ---------------------------------------------------------
        // 3. 🎭 زر اختيار الوضع (تفعيل القناة)
        // ---------------------------------------------------------
        if (interaction.customId === 'ai_mode_select_sfw' || interaction.customId === 'ai_mode_select_nsfw') {
            const mode = interaction.customId.includes('nsfw') ? 'NSFW' : 'SFW';
            
            // تفعيل القناة في قاعدة البيانات لمدة 24 ساعة
            aiConfig.setPaidChannel(guildID, interaction.channel.id, mode);

            // تحديث الرسالة لإخفاء الأزرار
            await interaction.update({
                content: `🔓 **تم تفعيل الشات بوضع ${mode}!**\nاستمتعوا لمدة 24 ساعة مع الإمبراطورة. ⏳`,
                components: [] 
            });
        }
    }
};
