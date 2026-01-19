const { Events, EmbedBuilder } = require('discord.js');
const aiLimitHandler = require('../utils/aiLimitHandler');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        if (!interaction.isButton()) return;

        // التحقق من آيدي الزر (ادفـع 2500)
        if (interaction.customId === 'ai_topup_2500') {
            const userID = interaction.user.id;
            const guildID = interaction.guild.id;
            const COST = 2500;
            const REWARD_MESSAGES = 100;

            // التحقق من رصيد المستخدم (مورا)
            // نستخدم client.getLevel لأن البيانات موجودة في جدول levels
            let userData = interaction.client.getLevel.get(userID, guildID);
            
            // إذا لم يكن لديه سجل، ننشئ له سجل افتراضي
            if (!userData) {
                userData = { ...interaction.client.defaultData, user: userID, guild: guildID };
            }

            // فحص الرصيد
            if (userData.mora < COST) {
                return interaction.reply({
                    content: `🚫 **عذراً، رصيدك غير كافٍ!**\nتحتاج إلى **${COST}** مورا، وأنت تملك **${userData.mora}** فقط.`,
                    ephemeral: true
                });
            }

            // خصم المبلغ
            userData.mora -= COST;
            interaction.client.setLevel.run(userData);

            // إضافة رصيد المحادثة
            aiLimitHandler.addPurchasedBalance(userID, REWARD_MESSAGES);

            // الرد بالنجاح
            const embed = new EmbedBuilder()
                .setColor(0x00FF00) // أخضر
                .setTitle('✅ تمت العملية بنجاح')
                .setDescription(`💎 **تم خصم ${COST} مورا.**\n🤖 **تمت إضافة ${REWARD_MESSAGES} رسالة لرصيد محادثتك مع الإمبراطورة.**\n\nاستمتع بوقتك!`)
                .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() });

            // تحديث الرسالة الأصلية لإزالة الزر (اختياري) أو إرسال رد جديد مخفي
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
};
