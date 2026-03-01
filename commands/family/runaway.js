// commands/family/runaway.js

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Colors } = require("discord.js");

const RUNAWAY_FEE = 1000; // تكلفة الهروب الثابتة (يمكن جعلها ديناميكية إذا أردت)
const MORA_EMOJI = '<:mora:1435647151349698621>'; 
const RUNAWAY_GIF = "https://media.tenor.com/ScoBC7-a5QkAAAAC/anime-run.gif"; 

module.exports = {
    name: 'runaway',
    description: 'الهروب من العائلة (يتم دفع الرسوم للوالدين كتعويض)',
    aliases: ['هروب', 'استقلال', 'escape'],

    async execute(message, args) {
        const client = message.client;
        const sql = client.sql;
        const guildId = message.guild.id;
        const userId = message.author.id;

        // دالة مساعدة للردود المؤقتة
        const replyTemp = async (content) => {
            const msg = await message.reply(content);
            setTimeout(() => msg.delete().catch(() => {}), 5000);
        };

        // 1. هل أنت ابن أصلاً؟
        const parents = sql.prepare("SELECT parentID FROM children WHERE childID = ? AND guildID = ?").all(userId, guildId);

        if (parents.length === 0) {
            return replyTemp("🚫 **أنت لست ابناً لأحد!** أنت حر طليق بالفعل 🦅.");
        }

        // 2. التحقق من الرصيد
        let userData = client.getLevel.get(userId, guildId);
        if (!userData) userData = { id: `${guildId}-${userId}`, user: userId, guild: guildId, xp: 0, level: 1, mora: 0 };

        if (userData.mora < RUNAWAY_FEE) {
            return replyTemp(`💸 **لا تملك تكلفة الاستقلال!**\nتحتاج إلى **${RUNAWAY_FEE.toLocaleString()}** ${MORA_EMOJI} لتعويض والديك.`);
        }

        // ==========================================================
        // 🏃‍♂️ لوحة التأكيد
        // ==========================================================

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('confirm_run').setLabel('نعم، سأهرب!').setStyle(ButtonStyle.Danger).setEmoji('🏃‍♂️'),
            new ButtonBuilder().setCustomId('cancel_run').setLabel('تراجع').setStyle(ButtonStyle.Secondary)
        );

        const embed = new EmbedBuilder()
            .setColor(Colors.Orange)
            .setTitle(`🏃‍♂️ قرار الهروب من العائلة`)
            .setDescription(
                `هل أنت متأكد أنك تريد الهروب من والديك والتخلي عن اسم العائلة؟\n\n` +
                `⚠️ **النتيجة:** سيتم حذف اسمك من سجلات العائلة فوراً.\n` +
                `💸 **التكلفة:** سيتم خصم **${RUNAWAY_FEE.toLocaleString()}** ${MORA_EMOJI} وتحويلها لوالديك كتعويض.\n\n` +
                `*هذا القرار نهائي ولا يمكن التراجع عنه.*`
            )
            .setThumbnail(message.author.displayAvatarURL());

        const confirmMsg = await message.reply({ embeds: [embed], components: [row] });

        const filter = i => i.user.id === userId;
        const collector = confirmMsg.createMessageComponentCollector({ filter, time: 60000, max: 1 });

        collector.on('collect', async i => {
            if (i.customId === 'cancel_run') {
                await i.update({ content: `✅ **تراجعت عن الهروب.** العائلة هي السند!`, embeds: [], components: [] });
                return;
            }

            if (i.customId === 'confirm_run') {
                // إعادة فحص المال (للاحتياط)
                userData = client.getLevel.get(userId, guildId);
                if (userData.mora < RUNAWAY_FEE) {
                    return i.update({ content: `❌ **فشلت الخطة:** ليس لديك مال كافٍ للتعويض!`, embeds: [], components: [] });
                }

                // 1. خصم الرسوم من الابن
                userData.mora -= RUNAWAY_FEE;
                client.setLevel.run(userData);

                // 2. توزيع المبلغ على الآباء (الموجودين)
                // إذا كان هناك أب واحد يأخذ المبلغ كاملاً، إذا اثنين يتقاسمونه
                const amountPerParent = Math.floor(RUNAWAY_FEE / parents.length);

                for (const p of parents) {
                    let parentData = client.getLevel.get(p.parentID, guildId);
                    // إذا لم يكن للأب حساب، ننشئ له واحداً لاستلام التعويض
                    if (!parentData) parentData = { id: `${guildId}-${p.parentID}`, user: p.parentID, guild: guildId, xp: 0, level: 1, mora: 0 };
                    
                    parentData.mora += amountPerParent;
                    client.setLevel.run(parentData);
                }

                // 3. الحذف من السجلات
                const stmt = sql.prepare("DELETE FROM children WHERE childID = ? AND guildID = ?");
                stmt.run(userId, guildId);

                // 4. رسالة النجاح
                const successEmbed = new EmbedBuilder()
                    .setColor(Colors.Red)
                    .setTitle(`🦅 تم الهروب بنجاح!`)
                    .setDescription(
                        `قام **${message.member.displayName}** بالهروب من عائلته وأصبح مستقلاً!\n` +
                        `💸 **التعويض:** تم تحويل **${amountPerParent.toLocaleString()}** ${MORA_EMOJI} لكل والد.`
                    )
                    .setImage(RUNAWAY_GIF);

                await i.update({ content: `💔 **انقطعت صلة الرحم..**`, embeds: [successEmbed], components: [] });
            }
        });

        collector.on('end', (c, reason) => {
            if (reason === 'time') {
                confirmMsg.edit({ content: `⏳ **انتهى الوقت..** يبدو أنك خفت من العقاب.`, embeds: [], components: [] }).catch(()=>{});
            }
        });
    }
};
