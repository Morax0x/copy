const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Colors } = require("discord.js");

const MORA_EMOJI = '<:mora:1435647151349698621>';
const MAX_CHILDREN = 10;
const BASE_ADOPT_FEE = 2000;

const SUCCESS_IMAGES = [
    "https://i.postimg.cc/NFjJ9WGf/09888ef8ca948e79af1de55c4133ba56.gif",
    "https://i.postimg.cc/rmK7wjp0/9b69370e7a44d135d98fa1c5c3cdd14f.gif",
    "https://i.postimg.cc/3wrPPY5j/072c330217a59b0edf061c88669d663b.gif",
    "https://i.postimg.cc/htnF1VCW/dd75d02bb40ac5721b7357b33d735489.gif"
];

const BOT_REJECT_IMAGE = "https://i.postimg.cc/qvDt3BLj/106a40ccbff92cbaf02fd54ba9de5ebc.gif";
const OWNER_ID = "1145327691772481577"; 

module.exports = {
    name: 'adopt',
    description: 'تبني عضو جديد في العائلة (بشروط صارمة لمنع تداخل الأنساب)',
    aliases: ['تبني', 'ضم'],

    async execute(message, args) {
        const client = message.client;
        const db = client.sql;
        const guildId = message.guild.id;
        const userId = message.author.id;

        const replyTemp = async (content) => {
            const msg = await message.reply(content);
            setTimeout(() => msg.delete().catch(() => {}), 8000); 
        };

        const childMember = message.mentions.members.first() || message.guild.members.cache.get(args[0]);

        if (!childMember) {
            return replyTemp(`❌ **خطأ في الاستخدام!**\nالطريقة الصحيحة: \`${message.content.split(' ')[0]} @الطفل\`\nمثال: \`!adopt @user\``);
        }

        if (childMember.id === client.user.id || childMember.id === OWNER_ID) {
            await message.reply({ files: [BOT_REJECT_IMAGE] });
            if (message.member.moderatable) {
                try {
                    await message.member.timeout(60 * 1000, "محاولة تبني غير قانونية (تطاول على المقامات)");
                } catch (e) {}
            }
            return;
        }

        if (childMember.id === userId) return replyTemp("❌ لا يمكنك تبني نفسك!");
        if (childMember.user.bot) return replyTemp("🤖 لا يمكنك تبني الروبوتات!");

        try {
            await db.query(`CREATE TABLE IF NOT EXISTS children ("parentID" TEXT, "childID" TEXT, "adoptDate" BIGINT, "guildID" TEXT)`);
        } catch (e) {}
        
        let currentChildrenCount = 0;
        try {
            // 🔥 حماية الحروف الصغيرة والكبيرة لكي يحسب الأبناء بشكل صحيح 🔥
            let countRes;
            try { countRes = await db.query(`SELECT count(*) as count FROM children WHERE "parentID" = $1 AND "guildID" = $2`, [userId, guildId]); }
            catch(e) { countRes = await db.query(`SELECT count(*) as count FROM children WHERE parentid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[{count:0}]})); }
            currentChildrenCount = Number(countRes.rows[0].count);
        } catch(e) {}

        if (currentChildrenCount >= MAX_CHILDREN) {
            return replyTemp(`🚫 **لقد وصلت للحد الأقصى من الأطفال (${MAX_CHILDREN})!**\nعليك التبرؤ من أحدهم أولاً باستخدام أمر \`!disown @الابن\``);
        }

        const fee = BASE_ADOPT_FEE + (currentChildrenCount * 2000);
        let authorData = await client.getLevel(userId, guildId);
        if (!authorData) authorData = { id: `${guildId}-${userId}`, user: userId, guild: guildId, xp: 0, level: 1, mora: 0 };
        authorData.mora = Number(authorData.mora) || 0;

        if (authorData.mora < fee) {
            return replyTemp(`💸 **ليس لديك مورا كافية!**\nالرسوم: **${fee.toLocaleString()}** ${MORA_EMOJI}`);
        }
        
        let partnerId = null;
        try {
            let marriageData;
            try { marriageData = await db.query(`SELECT "partnerID" FROM marriages WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]); }
            catch(e) { marriageData = await db.query(`SELECT partnerid as "partnerID" FROM marriages WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]})); }
            if (marriageData.rows.length > 0) partnerId = marriageData.rows[0].partnerID || marriageData.rows[0].partnerid;
        } catch(e) {}

        if (partnerId === childMember.id) return replyTemp("🚫 **لا يمكنك تبني شريك حياتك!**");

        let currentParents = [];
        try {
            let cpRes;
            try { cpRes = await db.query(`SELECT "parentID" FROM children WHERE "childID" = $1 AND "guildID" = $2`, [childMember.id, guildId]); }
            catch(e) { cpRes = await db.query(`SELECT parentid as "parentID" FROM children WHERE childid = $1 AND guildid = $2`, [childMember.id, guildId]).catch(()=>({rows:[]})); }
            currentParents = cpRes.rows;
        } catch(e) {}
        
        if (currentParents.length > 0) {
            let isStepParent = false;
            for (const row of currentParents) {
                const pId = row.parentID || row.parentid;
                if (pId === userId) {
                    return replyTemp(`❌ **${childMember.displayName}** هو ابنك بالفعل!`);
                }
                try {
                    let parentSpouseRes;
                    try { parentSpouseRes = await db.query(`SELECT "partnerID" FROM marriages WHERE "userID" = $1 AND "guildID" = $2`, [pId, guildId]); }
                    catch(e) { parentSpouseRes = await db.query(`SELECT partnerid as "partnerID" FROM marriages WHERE userid = $1 AND guildid = $2`, [pId, guildId]).catch(()=>({rows:[]})); }
                    const pSpouse = parentSpouseRes.rows[0];
                    if (pSpouse && (pSpouse.partnerID === userId || pSpouse.partnerid === userId)) {
                        isStepParent = true;
                        break;
                    }
                } catch(e) {}
            }

            if (!isStepParent) {
                return replyTemp(`🚫 **لا يمكن إتمام العملية!**\n**${childMember.displayName}** لديه عائلة بالفعل (أب/أم).\nلا يمكنك تبنيه إلا إذا كنت متزوجاً من والده/والدته الحاليين لإكمال العائلة.`);
            }
        }

        let queue = [userId]; 
        let checked = new Set();
        
        while (queue.length > 0) {
            let current = queue.shift();
            if (checked.has(current)) continue;
            checked.add(current);

            try {
                let parentsRes;
                try { parentsRes = await db.query(`SELECT "parentID" FROM children WHERE "childID" = $1 AND "guildID" = $2`, [current, guildId]); }
                catch(e) { parentsRes = await db.query(`SELECT parentid as "parentID" FROM children WHERE childid = $1 AND guildid = $2`, [current, guildId]).catch(()=>({rows:[]})); }
                for (const p of parentsRes.rows) {
                    const pId = p.parentID || p.parentid;
                    if (pId === childMember.id) {
                        return replyTemp(`🚫 **لا يعقل!** كيف تتبنى **${childMember.displayName}** وهو (أبوك/جدك)؟ احترم المقامات.`);
                    }
                    if (!checked.has(pId)) queue.push(pId);
                }
            } catch(e) {}
            if (checked.size > 20) break; 
        }

        queue = [userId];
        checked = new Set();
        let myDescendants = new Set();

        while (queue.length > 0) {
            let current = queue.shift();
            if (checked.has(current)) continue;
            checked.add(current);

            try {
                let childrenRes;
                try { childrenRes = await db.query(`SELECT "childID" FROM children WHERE "parentID" = $1 AND "guildID" = $2`, [current, guildId]); }
                catch(e) { childrenRes = await db.query(`SELECT childid as "childID" FROM children WHERE parentid = $1 AND guildid = $2`, [current, guildId]).catch(()=>({rows:[]})); }
                for (const c of childrenRes.rows) {
                    const cId = c.childID || c.childid;
                    myDescendants.add(cId);
                    if (cId === childMember.id) {
                        return replyTemp(`🚫 **هذا من نسلك!**\n**${childMember.displayName}** موجود بالفعل في شجرة عائلتك (حفيد أو حفيد حفيد..).\nهو مربوط بك بالدم ولا يحتاج لتبني.`);
                    }
                    if (!checked.has(cId)) queue.push(cId);
                }
            } catch(e) {}
            if (checked.size > 50) break;
        }

        let myParents = [];
        let childParents = [];
        try {
            let mpRes;
            try { mpRes = await db.query(`SELECT "parentID" FROM children WHERE "childID" = $1 AND "guildID" = $2`, [userId, guildId]); }
            catch(e) { mpRes = await db.query(`SELECT parentid as "parentID" FROM children WHERE childid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]})); }
            myParents = mpRes.rows.map(r => r.parentID || r.parentid);
            
            let cpRes;
            try { cpRes = await db.query(`SELECT "parentID" FROM children WHERE "childID" = $1 AND "guildID" = $2`, [childMember.id, guildId]); }
            catch(e) { cpRes = await db.query(`SELECT parentid as "parentID" FROM children WHERE childid = $1 AND guildid = $2`, [childMember.id, guildId]).catch(()=>({rows:[]})); }
            childParents = cpRes.rows.map(r => r.parentID || r.parentid);
        } catch(e) {}
        
        if (myParents.some(p => childParents.includes(p))) {
            return replyTemp(`🚫 **لا يعقل!** كيف تتبنى أخاك/أختك؟`);
        }

        try {
            let targetSpouseRes;
            try { targetSpouseRes = await db.query(`SELECT "partnerID" FROM marriages WHERE "userID" = $1 AND "guildID" = $2`, [childMember.id, guildId]); }
            catch(e) { targetSpouseRes = await db.query(`SELECT partnerid as "partnerID" FROM marriages WHERE userid = $1 AND guildid = $2`, [childMember.id, guildId]).catch(()=>({rows:[]})); }
            const targetSpouse = targetSpouseRes.rows[0];
            if (targetSpouse && myDescendants.has(targetSpouse.partnerID || targetSpouse.partnerid)) {
                return replyTemp(`🚫 **هذه زوجة ابنك / زوج ابنتك!**\nلا يمكن تبني أصهارك الموجودين في شجرة العائلة.`);
            }
        } catch(e) {}

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
            
            authorData = await client.getLevel(userId, guildId);
            authorData.mora = Number(authorData.mora) || 0;

            if (authorData.mora < fee) {
                return childConfirm.update({ content: `❌ **فشلت العملية:** الأب مفلس!`, components: [], embeds: [] });
            }

            authorData.mora -= fee;
            await client.setLevel(authorData);

            let childData = await client.getLevel(childMember.id, guildId);
            if (!childData) childData = { id: `${guildId}-${childMember.id}`, user: childMember.id, guild: guildId, xp: 0, level: 1, mora: 0 };
            childData.mora = Number(childData.mora) || 0;
            childData.mora += fee;
            await client.setLevel(childData);

            const now = Date.now();
            try {
                await db.query(`INSERT INTO children ("parentID", "childID", "adoptDate", "guildID") VALUES ($1, $2, $3, $4)`, [userId, childMember.id, now, guildId]);
            } catch(e) {
                await db.query(`INSERT INTO children (parentid, childid, adoptdate, guildid) VALUES ($1, $2, $3, $4)`, [userId, childMember.id, now, guildId]).catch(()=>{});
            }

            if (partnerId) {
                try {
                    let checkPartnerRes;
                    try { checkPartnerRes = await db.query(`SELECT 1 FROM children WHERE "parentID" = $1 AND "childID" = $2`, [partnerId, childMember.id]); }
                    catch(e) { checkPartnerRes = await db.query(`SELECT 1 FROM children WHERE parentid = $1 AND childid = $2`, [partnerId, childMember.id]).catch(()=>({rows:[]})); }
                    if (checkPartnerRes.rows.length === 0) {
                        try { await db.query(`INSERT INTO children ("parentID", "childID", "adoptDate", "guildID") VALUES ($1, $2, $3, $4)`, [partnerId, childMember.id, now, guildId]); }
                        catch(e) { await db.query(`INSERT INTO children (parentid, childid, adoptdate, guildid) VALUES ($1, $2, $3, $4)`, [partnerId, childMember.id, now, guildId]).catch(()=>{}); }
                    }
                } catch(e) {}
            }

            const randomImage = SUCCESS_IMAGES[Math.floor(Math.random() * SUCCESS_IMAGES.length)];

            const successEmbed = new EmbedBuilder()
                .setColor('Random') 
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
