// commands/family/adopt.js

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Colors } = require("discord.js");

const MORA_EMOJI = '<:mora:1435647151349698621>';
const MAX_CHILDREN = 10;
const BASE_ADOPT_FEE = 2000;

// 1. Success Images List (قائمة صور النجاح العشوائية)
const SUCCESS_IMAGES = [
    "https://i.postimg.cc/NFjJ9WGf/09888ef8ca948e79af1de55c4133ba56.gif",
    "https://i.postimg.cc/rmK7wjp0/9b69370e7a44d135d98fa1c5c3cdd14f.gif",
    "https://i.postimg.cc/3wrPPY5j/072c330217a59b0edf061c88669d663b.gif",
    "https://i.postimg.cc/htnF1VCW/dd75d02bb40ac5721b7357b33d735489.gif"
];

// صورة الرفض الخاصة (لك وللبوت)
const BOT_REJECT_IMAGE = "https://i.postimg.cc/qvDt3BLj/106a40ccbff92cbaf02fd54ba9de5ebc.gif";
const OWNER_ID = "1145327691772481577"; // الآيدي الخاص بك

module.exports = {
    name: 'adopt',
    description: 'تبني عضو جديد في العائلة (بشروط صارمة لمنع تداخل الأنساب)',
    aliases: ['تبني', 'ضم'],

    async execute(message, args) {
        const client = message.client;
        const sql = client.sql;
        const guildId = message.guild.id;
        const userId = message.author.id;

        // دالة مساعدة للردود المؤقتة
        const replyTemp = async (content) => {
            const msg = await message.reply(content);
            setTimeout(() => msg.delete().catch(() => {}), 8000); 
        };

        // 1. التحقق من المدخلات
        const childMember = message.mentions.members.first() || message.guild.members.cache.get(args[0]);

        if (!childMember) {
            return replyTemp(`❌ **خطأ في الاستخدام!**\nالطريقة الصحيحة: \`${message.content.split(' ')[0]} @الطفل\`\nمثال: \`!adopt @user\``);
        }

        // --- 🛡️ حماية خاصة (لك وللبوت) 🛡️ ---
        if (childMember.id === client.user.id || childMember.id === OWNER_ID) {
            await message.reply({ files: [BOT_REJECT_IMAGE] });
            if (message.member.moderatable) {
                try {
                    await message.member.timeout(60 * 1000, "محاولة تبني غير قانونية (تطاول على المقامات)");
                } catch (e) {
                    console.log(`[Anti-Adopt] Could not timeout user: ${e.message}`);
                }
            }
            return;
        }
        // ---------------------------------------

        if (childMember.id === userId) return replyTemp("❌ لا يمكنك تبني نفسك!");
        if (childMember.user.bot) return replyTemp("🤖 لا يمكنك تبني الروبوتات!");

        // 2. تجهيز الجداول
        sql.prepare(`CREATE TABLE IF NOT EXISTS children (parentID TEXT, childID TEXT, adoptDate INTEGER, guildID TEXT)`).run();
        
        // 3. فحوصات الحدود والمال
        const currentChildrenCount = sql.prepare("SELECT count(*) as count FROM children WHERE parentID = ? AND guildID = ?").get(userId, guildId).count;

        if (currentChildrenCount >= MAX_CHILDREN) {
            return replyTemp(`🚫 **لقد وصلت للحد الأقصى من الأطفال (${MAX_CHILDREN})!**`);
        }

        const fee = BASE_ADOPT_FEE + (currentChildrenCount * 2000);
        let authorData = client.getLevel.get(userId, guildId);
        if (!authorData) authorData = { id: `${guildId}-${userId}`, user: userId, guild: guildId, xp: 0, level: 1, mora: 0 };

        if (authorData.mora < fee) {
            return replyTemp(`💸 **ليس لديك مورا كافية!**\nالرسوم: **${fee.toLocaleString()}** ${MORA_EMOJI}`);
        }

        // ==========================================================
        // 🧬 فحوصات شجرة العائلة الصارمة (Incest Check) 🧬
        // ==========================================================
        
        // أ. هل أنت متزوج؟
        const marriageData = sql.prepare("SELECT partnerID FROM marriages WHERE userID = ? AND guildID = ?").get(userId, guildId);
        const partnerId = marriageData ? marriageData.partnerID : null;

        // ب. منع تبني الزوج/الزوجة
        if (partnerId === childMember.id) return replyTemp("🚫 **لا يمكنك تبني شريك حياتك!**");

        // ج. فحص الآباء الحاليين للطفل (هل هو يتيم؟)
        const currentParents = sql.prepare("SELECT parentID FROM children WHERE childID = ? AND guildID = ?").all(childMember.id, guildId);
        
        if (currentParents.length > 0) {
            // نسمح فقط بتبني "أبناء الزوج" (Step-Parent Adoption)
            const isStepParent = currentParents.some(row => {
                const parentSpouse = sql.prepare("SELECT partnerID FROM marriages WHERE userID = ? AND guildID = ?").get(row.parentID, guildId);
                return parentSpouse && parentSpouse.partnerID === userId;
            });

            if (!isStepParent) {
                return replyTemp(`🚫 **لا يمكن إتمام العملية!**\n**${childMember.displayName}** لديه عائلة بالفعل (أب/أم).\nلا يمكنك تبنيه إلا إذا كنت متزوجاً من والده/والدته الحاليين لإكمال العائلة.`);
            }
            
            if (currentParents.some(row => row.parentID === userId)) {
                return replyTemp(`❌ **${childMember.displayName}** هو ابنك بالفعل!`);
            }
        }

        // 🔥 د. فحص الأصول (Ancestors Check) - هل الطفل هو أبوك/جدك؟
        let queue = [userId]; 
        let checked = new Set();
        
        while (queue.length > 0) {
            let current = queue.shift();
            if (checked.has(current)) continue;
            checked.add(current);

            const parents = sql.prepare("SELECT parentID FROM children WHERE childID = ? AND guildID = ?").all(current, guildId);
            for (const p of parents) {
                if (p.parentID === childMember.id) {
                    return replyTemp(`🚫 **لا يعقل!** كيف تتبنى **${childMember.displayName}** وهو (أبوك/جدك)؟ احترم المقامات.`);
                }
                if (!checked.has(p.parentID)) queue.push(p.parentID);
            }
            if (checked.size > 20) break; 
        }

        // 🔥 هـ. فحص الفروع (Descendants Check) - هل الطفل هو حفيدك أصلاً؟
        queue = [userId];
        checked = new Set();
        let myDescendants = new Set();

        while (queue.length > 0) {
            let current = queue.shift();
            if (checked.has(current)) continue;
            checked.add(current);

            const children = sql.prepare("SELECT childID FROM children WHERE parentID = ? AND guildID = ?").all(current, guildId);
            for (const c of children) {
                myDescendants.add(c.childID);
                if (c.childID === childMember.id) {
                    return replyTemp(`🚫 **هذا من نسلك!**\n**${childMember.displayName}** موجود بالفعل في شجرة عائلتك (حفيد أو حفيد حفيد..).\nهو مربوط بك بالدم ولا يحتاج لتبني.`);
                }
                if (!checked.has(c.childID)) queue.push(c.childID);
            }
            if (checked.size > 50) break;
        }

        // 🔥 و. فحص الإخوة (Siblings Check) - هل هو أخوك؟
        // (إذا كان لديكم أب واحد مشترك على الأقل)
        const myParents = sql.prepare("SELECT parentID FROM children WHERE childID = ? AND guildID = ?").all(userId, guildId).map(r => r.parentID);
        const childParents = sql.prepare("SELECT parentID FROM children WHERE childID = ? AND guildID = ?").all(childMember.id, guildId).map(r => r.parentID);
        
        if (myParents.some(p => childParents.includes(p))) {
            return replyTemp(`🚫 **لا يعقل!** كيف تتبنى أخاك/أختك؟`);
        }

        // ز. فحص المصاهرة (In-laws Check)
        const targetSpouse = sql.prepare("SELECT partnerID FROM marriages WHERE userID = ? AND guildID = ?").get(childMember.id, guildId);
        
        if (targetSpouse && myDescendants.has(targetSpouse.partnerID)) {
            return replyTemp(`🚫 **هذه زوجة ابنك / زوج ابنتك!**\nلا يمكن تبني أصهارك الموجودين في شجرة العائلة.`);
        }


        // ==========================================================
        // 🚦 مرحلة الموافقات
        // ==========================================================

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
                    .setTitle('👨‍👩‍👧‍👦 قرار عائلي مشترك')
                    .setDescription(`**${message.member.displayName}** يريد تبني **${childMember.displayName}**.\nهل توافق على انضمام هذا الطفل للعائلة؟`)
                ],
                components: [rowPartner]
            });

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
                
                await confirmation.update({ content: `✅ **وافق الشريك!** الآن ننتظر موافقة الطفل...`, components: [] });

            } catch (e) {
                return partnerMsg.edit({ content: `⏳ **انتهى الوقت!** لم يرد الشريك.`, components: [], embeds: [] });
            }
        }

        // موافقة الطفل
        const rowChild = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('child_accept').setLabel('أقبل التبني').setStyle(ButtonStyle.Primary).setEmoji('👶'),
            new ButtonBuilder().setCustomId('child_reject').setLabel('أرفض').setStyle(ButtonStyle.Secondary)
        );

        const childMsg = await message.channel.send({
            content: `${childMember}`,
            embeds: [new EmbedBuilder()
                .setColor(Colors.Blue)
                .setTitle('🏠 عرض تبني')
                .setDescription(
                    `عرض عليك **${message.member.displayName}** ${partnerId ? `وشريكه` : ``} الانضمام لعائلتهم!\n` +
                    `هل تقبل أن تكون ابنهم؟\n\n` +
                    `💰 **هدية التبني:** سيتم تحويل **${fee.toLocaleString()}** ${MORA_EMOJI} لك!`
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
            
            authorData = client.getLevel.get(userId, guildId);
            if (authorData.mora < fee) {
                return childConfirm.update({ content: `❌ **فشلت العملية:** الأب مفلس!`, components: [], embeds: [] });
            }

            // الخصم والتحويل
            authorData.mora -= fee;
            client.setLevel.run(authorData);

            let childData = client.getLevel.get(childMember.id, guildId);
            if (!childData) childData = { id: `${guildId}-${childMember.id}`, user: childMember.id, guild: guildId, xp: 0, level: 1, mora: 0 };
            childData.mora += fee;
            client.setLevel.run(childData);

            // التسجيل
            const now = Date.now();
            const stmt = sql.prepare("INSERT INTO children (parentID, childID, adoptDate, guildID) VALUES (?, ?, ?, ?)");
            stmt.run(userId, childMember.id, now, guildId);

            if (partnerId) {
                const checkPartner = sql.prepare("SELECT 1 FROM children WHERE parentID = ? AND childID = ?").get(partnerId, childMember.id);
                if (!checkPartner) {
                    stmt.run(partnerId, childMember.id, now, guildId);
                }
            }

            // اختيار صورة ولون عشوائي
            const randomImage = SUCCESS_IMAGES[Math.floor(Math.random() * SUCCESS_IMAGES.length)];

            const successEmbed = new EmbedBuilder()
                .setColor('Random') // لون عشوائي
                .setTitle(`🎉 تهانينا للعائلة الجديدة!`)
                .setDescription(
                    `أصبح **${childMember.displayName}** رسمياً ابن **${message.member.displayName}** ${partnerId ? `وشريكه` : ``}!\n` +
                    `🎁 **هدية:** تم تحويل **${fee.toLocaleString()}** ${MORA_EMOJI} للطفل.`
                )
                .setImage(randomImage);

            await childConfirm.update({
                content: `||${message.author} ${childMember}||`,
                embeds: [successEmbed],
                components: []
            });

        } catch (e) {
            childMsg.edit({ content: `⏳ **انتهى الوقت..** الطفل لم يرد.`, components: [], embeds: [] });
        }
    }
};
