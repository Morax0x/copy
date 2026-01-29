// events/aiButtonListener.js

const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const aiLimitHandler = require('../utils/aiLimitHandler');
const aiConfig = require('../utils/aiConfig');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        // 1. التحقق أن التفاعل هو زر
        if (!interaction.isButton()) return;

        // 2. التحقق أن الزر يخص نظام الذكاء الاصطناعي
        if (!interaction.customId.startsWith('ai_')) return;

        // 3. منع الاستخدام في الخاص (DM)
        if (!interaction.guild) {
            return interaction.reply({ content: "❌ أوامر الذكاء الاصطناعي تعمل داخل السيرفرات فقط.", flags: [MessageFlags.Ephemeral] });
        }

        const userID = interaction.user.id;
        const guildID = interaction.guild.id;

        try {
            // =========================================================
            // 1. 💰 زر شحن رصيد الرسائل (Top-up Limit)
            // =========================================================
            if (interaction.customId === 'ai_topup_2500') {
                // ✅ تأجيل الرد فوراً لتجنب خطأ المهلة (3 ثواني)
                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

                const COST = 2500;
                const REWARD_MESSAGES = 100;

                // جلب بيانات المستخدم بأمان
                let userData = interaction.client.getLevel ? interaction.client.getLevel.get(userID, guildID) : null;
                if (!userData && interaction.client.defaultData) {
                    userData = { ...interaction.client.defaultData, user: userID, guild: guildID };
                }

                // التحقق من الرصيد
                if ((userData?.mora || 0) < COST) {
                    return interaction.editReply({
                        content: `🚫 **عذراً، رصيدك غير كافٍ!**\nتحتاج إلى **${COST}** مورا، وأنت تملك **${userData?.mora || 0}** فقط.`
                    });
                }

                // خصم المبلغ وحفظ البيانات
                userData.mora -= COST;
                if (interaction.client.setLevel) interaction.client.setLevel.run(userData);

                // إضافة رصيد الذكاء الاصطناعي
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
            else if (interaction.customId === 'ai_pay_category_1000') {
                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

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

                // إرسال رسالة جديدة للجميع لاختيار الوضع
                await interaction.channel.send({
                    content: `✅ **تم دفع ${COST} مورا من قبل ${interaction.user}!**\nالآن اختر شخصيتي لهذا اليوم (لمدة 24 ساعة):`,
                    components: [modeButtons]
                });
            }

            // =========================================================
            // 3. 🎭 زر اختيار الوضع (تفعيل القناة)
            // =========================================================
            else if (interaction.customId === 'ai_mode_select_sfw' || interaction.customId === 'ai_mode_select_nsfw') {
                // نستخدم deferUpdate لأننا سنعدل الرسالة الأصلية أو نحذف الأزرار
                await interaction.deferUpdate();

                const mode = interaction.customId.includes('nsfw') ? 'NSFW' : 'SFW';
                
                // تفعيل القناة في الكونفيج
                aiConfig.setPaidChannel(guildID, interaction.channel.id, mode);

                // تعديل الرسالة لإخفاء الأزرار وتأكيد التفعيل
                await interaction.editReply({
                    content: `🔓 **تم تفعيل الشات بوضع ${mode}!**\nاستمتعوا لمدة 24 ساعة مع الإمبراطورة. ⏳`,
                    components: [] 
                });
            }

        } catch (error) {
            console.error('[AI Button Error]', error);
            // محاولة إبلاغ المستخدم بالخطأ إذا لم يتم الرد بعد
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ حدث خطأ أثناء معالجة الطلب.', flags: [MessageFlags.Ephemeral] });
            } else {
                await interaction.followUp({ content: '❌ حدث خطأ أثناء معالجة الطلب.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
            }
        }
    }
};
