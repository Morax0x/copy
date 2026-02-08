const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Colors } = require("discord.js");

const MORA_EMOJI = '<:mora:1435647151349698621>';
const MAX_CHILDREN = 10;
const BASE_ADOPT_FEE = 2000;
const SUCCESS_IMAGE = "https://i.postimg.cc/NFjJ9WGf/09888ef8ca948e79af1de55c4133ba56.gif";

module.exports = {
    name: 'adopt',
    description: 'تبني عضو جديد في العائلة يتطلب موافقة الشريك والطفل',
    aliases: ['تبني', 'ضم'],

    async execute(message, args) {
        const client = message.client;
        const sql = client.sql;
        const guildId = message.guild.id;
        const userId = message.author.id;

        // دالة مساعدة للردود المؤقتة (تحذف بعد 5 ثواني)
        const replyTemp = async (content) => {
            const msg = await message.reply(content);
            setTimeout(() => msg.delete().catch(() => {}), 5000);
        };

        // 1. التحقق من المدخلات
        const childMember = message.mentions.members.first() || message.guild.members.cache.get(args[0]);

        if (!childMember) {
            return replyTemp(`❌ **خطأ في الاستخدام!**\nعليك منشنة الشخص الذي تريد تبنيه.\nمثال: \`!adopt @User\``);
        }

        if (childMember.id === userId) return replyTemp("❌ لا يمكنك تبني نفسك!");
        if (childMember.user.bot) return replyTemp("🤖 لا يمكنك تبني الروبوتات!");

        // 2. التحقق من عدد الأطفال وحساب الرسوم التصاعدية
        sql.prepare(`CREATE TABLE IF NOT EXISTS children (parentID TEXT, childID TEXT, adoptDate INTEGER, guildID TEXT)`).run();
        
        const currentChildrenCount = sql.prepare("SELECT count(*) as count FROM children WHERE parentID = ? AND guildID = ?").get(userId, guildId).count;

        if (currentChildrenCount >= MAX_CHILDREN) {
            return replyTemp(`🚫 **لقد وصلت للحد الأقصى من الأطفال (${MAX_CHILDREN})!**`);
        }

        // الرسوم = السعر الأساسي + (2000 * عدد الأطفال الحاليين)
        const fee = BASE_ADOPT_FEE + (currentChildrenCount * 2000);

        // 3. التحقق من الرصيد
        let authorData = client.getLevel.get(userId, guildId);
        if (!authorData) authorData = { id: `${guildId}-${userId}`, user: userId, guild: guildId, xp: 0, level: 1, mora: 0 };

        if (authorData.mora < fee) {
            return replyTemp(`💸 **ليس لديك مورا كافية!**\nرسوم تبني الطفل رقم ${currentChildrenCount + 1}: **${fee.toLocaleString()}** ${MORA_EMOJI}`);
        }

        // ==========================================================
        // 🧬 الفحوصات المنطقية (منع اختلاط الأنساب والمحارم)
        // ==========================================================
        
        // أ. هل أنت متزوج؟
        const marriageData = sql.prepare("SELECT partnerID FROM marriages WHERE userID = ? AND guildID = ?").get(userId, guildId);
        const partnerId = marriageData ? marriageData.partnerID : null;

        // ب. هل تحاول تبني زوجتك؟
        if (partnerId === childMember.id) {
            return replyTemp("🚫 **لا يمكنك تبني شريك حياتك!**");
        }

        // د. هل هذا الطفل متبنى من قبلك بالفعل؟
        const existingChild = sql.prepare("SELECT 1 FROM children WHERE parentID = ? AND childID = ? AND guildID = ?").get(userId, childMember.id, guildId);
        if (existingChild) {
            return replyTemp(`❌ **${childMember.displayName}** هو ابنك بالفعل!`);
        }

        // هـ. هل هذا الطفل هو "أبوك"؟ (منع الدورات)
        const isMyParent = sql.prepare("SELECT 1 FROM children WHERE parentID = ? AND childID = ? AND guildID = ?").get(childMember.id, userId, guildId);
        if (isMyParent) {
            return replyTemp("🚫 **لا يمكنك تبني والدك/والدتك!**");
        }

        // و. هل الطفل لديه عائلة بالفعل؟ (يُسمح بوالدين فقط كحد أقصى)
        const currentParents = sql.prepare("SELECT parentID FROM children WHERE childID = ? AND guildID = ?").all(childMember.id, guildId);
        if (currentParents.length >= 2) {
            return replyTemp(`🚫 **${childMember.displayName}** لديه والدين بالفعل! لا يمكن تبنيه.`);
        }

        // ==========================================================
        // 🚦 مرحلة الموافقات (الزوجة أولاً، ثم الطفل)
        // ==========================================================

        // 1. إذا كان متزوجاً -> نطلب موافقة الشريك أولاً
        if (partnerId) {
            const partnerMember = await message.guild.members.fetch(partnerId).catch(() => null);
            if (!partnerMember) return replyTemp("❌ شريكك غير موجود في السيرفر!");

            const rowPartner = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('partner_approve').setLabel('موافقة (شريك)').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('partner_reject').setLabel('رفض').setStyle(ButtonStyle.Danger)
            );

            const partnerMsg = await message.channel.send({
                content: `${partnerMember}`,
                embeds: [new EmbedBuilder()
                    .setColor(Colors.Gold)
                    .setTitle('👨‍👩‍👧‍👦 مشـورة عائليـة')
                    .setDescription(`**${message.member.displayName}** يريد تبني **${childMember.displayName}**.\nهل توافق على انضمام هذا الطفل للعائلة؟`)
                    .setFooter({ text: 'يجب موافقة الشريكين قبل عرض الأمر على الطفل' })
                ],
                components: [rowPartner]
            });

            // كوليكتور الشريك
            try {
                const confirmation = await partnerMsg.awaitMessageComponent({ 
                    filter: i => i.user.id === partnerId, 
                    time: 60000,
                    componentType: ComponentType.Button 
                });

                if (confirmation.customId === 'partner_reject') {
                    await confirmation.update({ content: `🚫 **${partnerMember.displayName}** رفض التبني.`, embeds: [], components: [] });
                    return;
                }
                
                await confirmation.update({ content: `✅ **وافق الشريك!** جارٍ إرسال العرض للطفل...`, components: [] });

            } catch (e) {
                return partnerMsg.edit({ content: `⏳ **انتهى الوقت!** لم يرد الشريك.`, components: [], embeds: [] });
            }
        }

        // 2. طلب موافقة الطفل (الخطوة النهائية)
        const rowChild = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('child_accept').setLabel('قبول التبني').setStyle(ButtonStyle.Primary).setEmoji('👶'),
            new ButtonBuilder().setCustomId('child_reject').setLabel('رفض').setStyle(ButtonStyle.Secondary)
        );

        const childMsg = await message.channel.send({
            content: `${childMember}`,
            embeds: [new EmbedBuilder()
                .setColor(Colors.Blue)
                .setTitle('🏠 عرض انضمام للعائلة')
                .setDescription(
                    `عرض عليك **${message.member.displayName}** ${partnerId ? `وشريكه` : ``} الانضمام لعائلتهم!\n` +
                    `هل تقبل أن تكون ابناً باراً لهم؟\n\n` +
                    `🎁 **هدية التبني:** سيصلك مبلغ **${fee.toLocaleString()}** ${MORA_EMOJI} عند القبول.`
                )
            ],
            components: [rowChild]
        });

        try {
            const childConfirm = await childMsg.awaitMessageComponent({
                filter: i => i.user.id === childMember.id,
                time: 60000,
                componentType: ComponentType.Button
            });

            if (childConfirm.customId === 'child_reject') {
                await childConfirm.update({ content: `💔 رفض **${childMember.displayName}** العرض.`, embeds: [], components: [] });
                return;
            }

            // ==========================================================
            // ✅ التنفيذ النهائي
            // ==========================================================
            
            // إعادة فحص المال
            authorData = client.getLevel.get(userId, guildId);
            if (authorData.mora < fee) {
                return childConfirm.update({ content: `❌ **فشلت العملية:** الأب أفلس أثناء الانتظار!`, components: [], embeds: [] });
            }

            // 1. الخصم
            authorData.mora -= fee;
            client.setLevel.run(authorData);

            // 2. التحويل للطفل
            let childData = client.getLevel.get(childMember.id, guildId);
            if (!childData) childData = { id: `${guildId}-${childMember.id}`, user: childMember.id, guild: guildId, xp: 0, level: 1, mora: 0 };
            childData.mora += fee;
            client.setLevel.run(childData);

            // 3. الحفظ في الداتابيس (للأب)
            const now = Date.now();
            const stmt = sql.prepare("INSERT INTO children (parentID, childID, adoptDate, guildID) VALUES (?, ?, ?, ?)");
            stmt.run(userId, childMember.id, now, guildId);

            // 4. الحفظ في الداتابيس (للشريك إن وجد)
            if (partnerId) {
                const checkPartner = sql.prepare("SELECT 1 FROM children WHERE parentID = ? AND childID = ?").get(partnerId, childMember.id);
                if (!checkPartner) {
                    stmt.run(partnerId, childMember.id, now, guildId);
                }
            }

            const successEmbed = new EmbedBuilder()
                .setColor(Colors.Green)
                .setTitle(`🎉 اكتملت العائلة!`)
                .setDescription(
                    `أصبح **${childMember.displayName}** رسمياً ابن **${message.member.displayName}** ${partnerId ? `وشريكه` : ``}!\n` +
                    `🎁 **الهدية:** تم تحويل **${fee.toLocaleString()}** ${MORA_EMOJI} لرصيد الابن.`
                )
                .setImage(SUCCESS_IMAGE);

            await childConfirm.update({
                content: `||${message.author} ${childMember}||`,
                embeds: [successEmbed],
                components: []
            });

        } catch (e) {
            childMsg.edit({ content: `⏳ **انتهى الوقت..** الطفل لم يرد على العرض.`, components: [], embeds: [] });
        }
    }
};
