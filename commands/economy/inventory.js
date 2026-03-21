const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, UserSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, Colors, MessageFlags } = require('discord.js');

const weaponsConfig = require('../../json/weapons-config.json');
const skillsConfig = require('../../json/skills-config.json');
const upgradeMats = require('../../json/upgrade-materials.json');

let fishData = [], farmItems = [];
try { fishData = require('../../json/fish.json'); } catch(e) {}
try { farmItems = require('../../json/seeds.json').concat(require('../../json/feed-items.json')); } catch(e) {}

const EMOJI_MORA = '<:mora:1435647151349698621>';

function resolveItemInfo(itemId) {
    if (upgradeMats && upgradeMats.weapon_materials) {
        for (const race of upgradeMats.weapon_materials) {
            const mat = race.materials.find(m => m.id === itemId);
            if (mat) return { name: mat.name, emoji: mat.emoji, category: 'materials' };
        }
    }
    if (upgradeMats && upgradeMats.skill_books) {
        for (const cat of upgradeMats.skill_books) {
            const book = cat.books.find(b => b.id === itemId);
            if (book) return { name: book.name, emoji: book.emoji, category: 'materials' };
        }
    }
    if (fishData && fishData.length > 0) {
        const fish = fishData.find(f => f.id === itemId || f.name === itemId);
        if (fish) return { name: fish.name, emoji: fish.emoji || '🐟', category: 'fishing' };
    }
    if (farmItems && farmItems.length > 0) {
        const farmObj = farmItems.find(f => f.id === itemId || f.name === itemId);
        if (farmObj) return { name: farmObj.name, emoji: farmObj.emoji || '🌾', category: 'farming' };
    }
    return { name: itemId, emoji: '📦', category: 'others' };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('عرض حقيبتك وممتلكاتك ومبادلة العناصر مع الآخرين')
        .addUserOption(option => option.setName('user').setDescription('عرض حقيبة عضو آخر').setRequired(false)),
        
    name: 'حقيبة',
    aliases: ['inv', 'inventory', 'شنطة', 'اغراض'],
    category: 'RPG',

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const client = interactionOrMessage.client;
        const db = client.sql;
        const guildId = interactionOrMessage.guild.id;

        const user = isSlash ? interactionOrMessage.user : interactionOrMessage.author;

        let targetUser;
        if (isSlash) {
            targetUser = interactionOrMessage.options.getMember('user') || interactionOrMessage.member;
            await interactionOrMessage.deferReply();
        } else {
            targetUser = interactionOrMessage.mentions.members.first() || interactionOrMessage.guild.members.cache.get(args[0]) || interactionOrMessage.member;
        }

        const reply = async (payload) => isSlash ? interactionOrMessage.editReply(payload) : interactionOrMessage.reply(payload);

        if (!targetUser || targetUser.user.bot) return reply({ content: "❌ لا يمكن عرض حقيبة هذا العضو." });

        const userId = targetUser.id;
        const isOwnInventory = userId === user.id;

        // ==========================================
        // 📥 سحب البيانات من الداتابيز
        // ==========================================
        let inventory = [], weapons = [], skills = [];
        try {
            let invRes;
            try { invRes = await db.query(`SELECT * FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]); }
            catch(e) { invRes = await db.query(`SELECT * FROM user_inventory WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]})); }
            inventory = invRes.rows;

            let wepRes;
            try { wepRes = await db.query(`SELECT * FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]); }
            catch(e) { wepRes = await db.query(`SELECT * FROM user_weapons WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]})); }
            weapons = wepRes.rows;

            let skillRes;
            try { skillRes = await db.query(`SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]); }
            catch(e) { skillRes = await db.query(`SELECT * FROM user_skills WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]})); }
            skills = skillRes.rows;
        } catch (e) {
            return reply({ content: "❌ حدث خطأ أثناء سحب بيانات الحقيبة." });
        }

        const categories = { materials: [], fishing: [], farming: [], others: [] };
        for (const row of inventory) {
            const itemId = row.itemID || row.itemid;
            const quantity = Number(row.quantity) || 0;
            if (quantity <= 0) continue;
            const itemInfo = resolveItemInfo(itemId);
            categories[itemInfo.category].push(`${itemInfo.emoji} **${itemInfo.name}** : \`${quantity.toLocaleString()}\``);
        }

        const embeds = {};
        const combatEmbed = new EmbedBuilder().setTitle(`⚔️ المعدات القتالية لـ ${targetUser.displayName}`).setColor(Colors.DarkRed).setThumbnail(targetUser.user.displayAvatarURL({ dynamic: true }));
        let combatDesc = "**🗡️ السلاح الحالي:**\n";
        if (weapons.length > 0) {
            const wData = weapons[0];
            const wConf = weaponsConfig.find(w => w.race === (wData.raceName || wData.racename));
            if (wConf) combatDesc += `> ${wConf.emoji} **${wConf.name}** (Lv.${wData.weaponLevel || wData.weaponlevel})\n`;
            else combatDesc += `> ❓ سلاح غير معروف\n`;
        } else combatDesc += `> لا يملك سلاحاً بعد.\n`;

        combatDesc += "\n**📜 المهارات المكتسبة:**\n";
        if (skills.length > 0) {
            skills.forEach(s => {
                const sConf = skillsConfig.find(sc => sc.id === (s.skillID || s.skillid));
                if (sConf) combatDesc += `> ${sConf.emoji} **${sConf.name}** (Lv.${s.skillLevel || s.skilllevel})\n`;
            });
        } else combatDesc += `> لا يملك أي مهارات.\n`;
        combatEmbed.setDescription(combatDesc);
        embeds['combat'] = combatEmbed;

        const createCategoryEmbed = (title, color, itemsArray, emptyMsg) => {
            const embed = new EmbedBuilder().setTitle(title).setColor(color).setThumbnail(targetUser.user.displayAvatarURL({ dynamic: true }));
            if (itemsArray.length === 0) embed.setDescription(`> ${emptyMsg}`);
            else {
                let desc = "";
                itemsArray.forEach(item => { if ((desc + item + "\n").length < 4000) desc += `> ${item}\n`; });
                embed.setDescription(desc);
            }
            return embed;
        };

        embeds['materials'] = createCategoryEmbed(`💎 موارد التطوير والخامات`, Colors.Purple, categories.materials, "الحقيبة فارغة من الخامات. افتح الصناديق للحصول عليها!");
        embeds['fishing'] = createCategoryEmbed(`🎣 معدات وصيد البحر`, Colors.Blue, categories.fishing, "لا يوجد أسماك أو معدات صيد هنا.");
        embeds['farming'] = createCategoryEmbed(`🌾 أدوات ومحاصيل المزرعة`, Colors.Green, categories.farming, "لا يوجد بذور أو محاصيل هنا.");
        embeds['others'] = createCategoryEmbed(`🎒 متفرقات أخرى`, Colors.Grey, categories.others, "لا توجد عناصر أخرى.");

        const menuRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId(`inv_menu_${user.id}`).setPlaceholder('تصفح أقسام الحقيبة...').addOptions([
                { label: 'الأسلحة والمهارات', value: 'combat', emoji: '⚔️' },
                { label: 'موارد التطوير', value: 'materials', emoji: '💎' },
                { label: 'الصيد والأسماك', value: 'fishing', emoji: '🎣' },
                { label: 'المزرعة والزراعة', value: 'farming', emoji: '🌾' },
                { label: 'متفرقات', value: 'others', emoji: '🎒' }
            ])
        );

        const tradeBtnRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`inv_trade_init_${user.id}`).setLabel('مبادلة / إهداء عنصر 🤝').setStyle(ButtonStyle.Success)
        );

        let currentCategory = 'combat';
        const getComponents = () => isOwnInventory ? [menuRow, tradeBtnRow] : [menuRow];

        const msg = await reply({ embeds: [embeds['combat']], components: getComponents() });

        // ==========================================
        // 🔄 نظام التفاعل والتبادل (Trade Flow)
        // ==========================================
        const filter = i => i.user.id === user.id && i.customId.includes(user.id);
        const collector = msg.createMessageComponentCollector({ filter, time: 180000 });

        let tradeState = { itemID: null, targetID: null };

        collector.on('collect', async (i) => {
            if (i.isStringSelectMenu() && i.customId === `inv_menu_${user.id}`) {
                currentCategory = i.values[0];
                await i.update({ embeds: [embeds[currentCategory]], components: getComponents() });
            } 
            else if (i.isButton() && i.customId === `inv_trade_init_${user.id}`) {
                if (currentCategory === 'combat') {
                    return i.reply({ content: '❌ الأسلحة والمهارات مرتبطة بروحك ولا يمكن مبادلتها!', flags: [MessageFlags.Ephemeral] });
                }

                // فلترة العناصر في القسم المفتوح حالياً للتبادل
                const tradableItems = inventory.filter(row => resolveItemInfo(row.itemID || row.itemid).category === currentCategory && (Number(row.quantity) > 0));
                if (tradableItems.length === 0) return i.reply({ content: '❌ لا تملك أي عناصر في هذا القسم لتبادلها.', flags: [MessageFlags.Ephemeral] });

                const options = tradableItems.slice(0, 25).map(row => {
                    const info = resolveItemInfo(row.itemID || row.itemid);
                    return { label: info.name, value: row.itemID || row.itemid, emoji: info.emoji, description: `الكمية المتاحة: ${row.quantity}` };
                });

                const itemSelect = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId(`inv_trade_item_${user.id}`).setPlaceholder('اختر العنصر الذي تريد إرساله...').addOptions(options)
                );

                await i.update({ components: [itemSelect] });
            }
            else if (i.isStringSelectMenu() && i.customId === `inv_trade_item_${user.id}`) {
                tradeState.itemID = i.values[0];
                
                const userSelect = new ActionRowBuilder().addComponents(
                    new UserSelectMenuBuilder().setCustomId(`inv_trade_target_${user.id}`).setPlaceholder('اختر اللاعب الذي تريد التعامل معه...')
                );
                await i.update({ components: [userSelect] });
            }
            else if (i.isUserSelectMenu() && i.customId === `inv_trade_target_${user.id}`) {
                tradeState.targetID = i.values[0];

                if (tradeState.targetID === user.id) return i.reply({ content: '❌ لا يمكنك التبادل مع نفسك!', flags: [MessageFlags.Ephemeral] });
                const targetUserObj = await client.users.fetch(tradeState.targetID).catch(()=>null);
                if (targetUserObj && targetUserObj.bot) return i.reply({ content: '❌ لا يمكنك التبادل مع البوتات!', flags: [MessageFlags.Ephemeral] });

                // فتح نموذج تحديد الكمية والسعر
                const modal = new ModalBuilder().setCustomId(`inv_trade_modal_${user.id}`).setTitle('إعدادات المبادلة');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trade_qty').setLabel('الكمية المراد إرسالها').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trade_price').setLabel('السعر (مورا) - ضع 0 إذا كانت هدية').setStyle(TextInputStyle.Short).setValue('0').setRequired(true))
                );
                await i.showModal(modal);

                try {
                    const modalSubmit = await i.awaitModalSubmit({ filter: m => m.user.id === user.id && m.customId === `inv_trade_modal_${user.id}`, time: 60000 });
                    const qty = parseInt(modalSubmit.fields.getTextInputValue('trade_qty'));
                    const price = parseInt(modalSubmit.fields.getTextInputValue('trade_price'));

                    if (isNaN(qty) || qty <= 0) return modalSubmit.reply({ content: '❌ كمية غير صالحة.', flags: [MessageFlags.Ephemeral] });
                    if (isNaN(price) || price < 0) return modalSubmit.reply({ content: '❌ سعر غير صالح.', flags: [MessageFlags.Ephemeral] });

                    // التحقق من أن المرسل يملك الكمية
                    let checkInv;
                    try { checkInv = await db.query(`SELECT "quantity", "id" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guildId, tradeState.itemID]); }
                    catch(e) { checkInv = await db.query(`SELECT quantity, id FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guildId, tradeState.itemID]); }
                    
                    const senderInvData = checkInv.rows[0];
                    if (!senderInvData || Number(senderInvData.quantity) < qty) {
                        return modalSubmit.reply({ content: '❌ أنت لا تملك هذه الكمية في حقيبتك!', flags: [MessageFlags.Ephemeral] });
                    }

                    const itemInfo = resolveItemInfo(tradeState.itemID);

                    // ===================================
                    // 🎁 نظام الإهداء المباشر (بدون سعر)
                    // ===================================
                    if (price === 0) {
                        await db.query('BEGIN');
                        const newSenderQty = Number(senderInvData.quantity) - qty;
                        if (newSenderQty > 0) {
                            try { await db.query(`UPDATE user_inventory SET "quantity" = $1 WHERE "id" = $2`, [newSenderQty, senderInvData.id]); }
                            catch(e) { await db.query(`UPDATE user_inventory SET quantity = $1 WHERE id = $2`, [newSenderQty, senderInvData.id]); }
                        } else {
                            try { await db.query(`DELETE FROM user_inventory WHERE "id" = $1`, [senderInvData.id]); }
                            catch(e) { await db.query(`DELETE FROM user_inventory WHERE id = $1`, [senderInvData.id]); }
                        }

                        try { await db.query(`INSERT INTO user_inventory ("userID", "guildID", "itemID", "quantity") VALUES ($1, $2, $3, $4) ON CONFLICT ("userID", "guildID", "itemID") DO UPDATE SET "quantity" = user_inventory."quantity" + $4`, [tradeState.targetID, guildId, tradeState.itemID, qty]); }
                        catch(e) { await db.query(`INSERT INTO user_inventory (userid, guildid, itemid, quantity) VALUES ($1, $2, $3, $4) ON CONFLICT (userid, guildid, itemid) DO UPDATE SET quantity = user_inventory.quantity + $4`, [tradeState.targetID, guildId, tradeState.itemID, qty]).catch(()=>{}); }
                        await db.query('COMMIT');

                        const giftEmbed = new EmbedBuilder().setColor(Colors.LuminousVividPink).setDescription(`🎁 <@${user.id}> أرسل **${qty}x ${itemInfo.emoji} ${itemInfo.name}** كهدية إلى <@${tradeState.targetID}>!`);
                        await modalSubmit.reply({ embeds: [giftEmbed] });
                        
                        // نرجع الحقيبة للوضع الطبيعي
                        await msg.edit({ components: getComponents() }).catch(()=>{});
                    } 
                    // ===================================
                    // ⚖️ نظام المبادلة التجارية (بسعر)
                    // ===================================
                    else {
                        await modalSubmit.deferReply();
                        const tradeEmbed = new EmbedBuilder()
                            .setTitle('⚖️ عـقـد تـجـاري')
                            .setColor(Colors.Gold)
                            .setDescription(`مرحباً <@${tradeState.targetID}>!\nيعرض عليك <@${user.id}> هذه الصفقة:\n\n**تستلم:** ${qty}x ${itemInfo.emoji} ${itemInfo.name}\n**تدفع:** ${price.toLocaleString()} ${EMOJI_MORA}\n\nهل تقبل الصفقة؟`);
                        
                        const tradeId = Date.now().toString();
                        const tradeButtons = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`trade_acc_${tradeId}`).setLabel('قبول وشراء ✅').setStyle(ButtonStyle.Success),
                            new ButtonBuilder().setCustomId(`trade_dec_${tradeId}`).setLabel('رفض الصفقة ❌').setStyle(ButtonStyle.Danger)
                        );

                        const tradeMsgObj = await modalSubmit.followUp({ content: `<@${tradeState.targetID}>`, embeds: [tradeEmbed], components: [tradeButtons] });
                        
                        // نرجع الحقيبة
                        msg.edit({ components: getComponents() }).catch(()=>{});

                        // ننتظر رد المشتري
                        const tradeFilter = btn => btn.user.id === tradeState.targetID && btn.customId.includes(tradeId);
                        const tradeCollector = tradeMsgObj.createMessageComponentCollector({ filter: tradeFilter, time: 60000 });

                        tradeCollector.on('collect', async btn => {
                            await btn.deferUpdate();
                            if (btn.customId.includes('dec_')) {
                                tradeEmbed.setColor(Colors.Red).setDescription(`❌ تم رفض الصفقة من قبل <@${tradeState.targetID}>.`);
                                return tradeMsgObj.edit({ embeds: [tradeEmbed], components: [] });
                            }

                            // قبول الصفقة: نتحقق من كل شيء وقت القبول
                            let targetLvlRes;
                            try { targetLvlRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [tradeState.targetID, guildId]); }
                            catch(e) { targetLvlRes = await db.query(`SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [tradeState.targetID, guildId]); }
                            
                            const targetMora = targetLvlRes.rows[0] ? Number(targetLvlRes.rows[0].mora) : 0;
                            if (targetMora < price) {
                                return btn.followUp({ content: '❌ لا تملك المورا الكافية لإتمام الصفقة!', flags: [MessageFlags.Ephemeral] });
                            }

                            // نتحقق أن البائع ما زال يملك العنصر
                            let checkInvFinal;
                            try { checkInvFinal = await db.query(`SELECT "quantity", "id" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guildId, tradeState.itemID]); }
                            catch(e) { checkInvFinal = await db.query(`SELECT quantity, id FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guildId, tradeState.itemID]); }
                            
                            const senderInvFinal = checkInvFinal.rows[0];
                            if (!senderInvFinal || Number(senderInvFinal.quantity) < qty) {
                                tradeEmbed.setColor(Colors.Red).setDescription(`❌ فشلت الصفقة: البائع لا يملك الكمية المطلوبة حالياً!`);
                                return tradeMsgObj.edit({ embeds: [tradeEmbed], components: [] });
                            }

                            // تنفيذ نقل المليكة والمورا بأمان
                            try {
                                await db.query('BEGIN');
                                // خصم العنصر من البائع
                                const finalSenderQty = Number(senderInvFinal.quantity) - qty;
                                if (finalSenderQty > 0) {
                                    try { await db.query(`UPDATE user_inventory SET "quantity" = $1 WHERE "id" = $2`, [finalSenderQty, senderInvFinal.id]); }
                                    catch(e) { await db.query(`UPDATE user_inventory SET quantity = $1 WHERE id = $2`, [finalSenderQty, senderInvFinal.id]); }
                                } else {
                                    try { await db.query(`DELETE FROM user_inventory WHERE "id" = $1`, [senderInvFinal.id]); }
                                    catch(e) { await db.query(`DELETE FROM user_inventory WHERE id = $1`, [senderInvFinal.id]); }
                                }
                                // إضافة العنصر للمشتري
                                try { await db.query(`INSERT INTO user_inventory ("userID", "guildID", "itemID", "quantity") VALUES ($1, $2, $3, $4) ON CONFLICT ("userID", "guildID", "itemID") DO UPDATE SET "quantity" = user_inventory."quantity" + $4`, [tradeState.targetID, guildId, tradeState.itemID, qty]); }
                                catch(e) { await db.query(`INSERT INTO user_inventory (userid, guildid, itemid, quantity) VALUES ($1, $2, $3, $4) ON CONFLICT (userid, guildid, itemid) DO UPDATE SET quantity = user_inventory.quantity + $4`, [tradeState.targetID, guildId, tradeState.itemID, qty]).catch(()=>{}); }
                                
                                // نقل المورا
                                try { await db.query(`UPDATE levels SET "mora" = "mora" - $1 WHERE "user" = $2 AND "guild" = $3`, [price, tradeState.targetID, guildId]); }
                                catch(e) { await db.query(`UPDATE levels SET mora = mora - $1 WHERE userid = $2 AND guildid = $3`, [price, tradeState.targetID, guildId]); }

                                try { await db.query(`UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3`, [price, user.id, guildId]); }
                                catch(e) { await db.query(`UPDATE levels SET mora = mora + $1 WHERE userid = $2 AND guildid = $3`, [price, user.id, guildId]); }

                                await db.query('COMMIT');

                                tradeEmbed.setColor(Colors.Green).setDescription(`✅ **تمت الصفقة بنجاح!**\nاشترى <@${tradeState.targetID}> ${qty}x ${itemInfo.name} مقابل ${price.toLocaleString()} ${EMOJI_MORA} من <@${user.id}>.`);
                                await tradeMsgObj.edit({ embeds: [tradeEmbed], components: [] });
                            } catch (e) {
                                await db.query('ROLLBACK').catch(()=>{});
                                tradeEmbed.setColor(Colors.Red).setDescription(`❌ حدث خطأ فني أثناء توقيع العقد.`);
                                await tradeMsgObj.edit({ embeds: [tradeEmbed], components: [] });
                            }
                        });

                        tradeCollector.on('end', collected => {
                            if (collector.size === 0) {
                                tradeEmbed.setColor(Colors.Grey).setDescription(`⏳ انتهى وقت العرض. تم سحب الصفقة.`);
                                tradeMsgObj.edit({ embeds: [tradeEmbed], components: [] }).catch(()=>{});
                            }
                        });
                    }

                } catch (e) {
                    // لم يقم بتعبئة المودال بالوقت المحدد
                    try { msg.edit({ components: getComponents() }); } catch(err) {}
                }
            }
        });

        collector.on('end', () => {
            try { msg.edit({ components: [] }).catch(()=>{}); } catch(e) {}
        });
    }
};
