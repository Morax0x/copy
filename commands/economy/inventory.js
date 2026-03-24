const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, UserSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, Colors, MessageFlags, AttachmentBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');

let generateInventoryCard;
try {
    ({ generateInventoryCard } = require('../../generators/inventory-generator.js'));
} catch (e) {
    generateInventoryCard = null;
}

const weaponsConfig = require('../../json/weapons-config.json');
const skillsConfig = require('../../json/skills-config.json');
const upgradeMats = require('../../json/upgrade-materials.json');

let fishData = [], farmItems = [];
try { fishData = require('../../json/fish.json'); } catch(e) {}
try { farmItems = require('../../json/seeds.json').concat(require('../../json/feed-items.json')); } catch(e) {}

const EMOJI_MORA = '<:mora:1435647151349698621>';

const ID_TO_IMAGE = {
    'mat_dragon_1': 'dragon_ash.png', 'mat_dragon_2': 'dragon_scale.png', 'mat_dragon_3': 'dragon_claw.png', 'mat_dragon_4': 'dragon_heart.png', 'mat_dragon_5': 'dragon_core.png',
    'mat_human_1': 'human_iron.png', 'mat_human_2': 'human_steel.png', 'mat_human_3': 'human_meteor.png', 'mat_human_4': 'human_seal.png', 'mat_human_5': 'human_crown.png',
    'mat_elf_1': 'elf_branch.png', 'mat_elf_2': 'elf_bark.png', 'mat_elf_3': 'elf_flower.png', 'mat_elf_4': 'elf_crystal.png', 'mat_elf_5': 'elf_tear.png',
    'mat_darkelf_1': 'darkelf_obsidian.png', 'mat_darkelf_2': 'darkelf_glass.png', 'mat_darkelf_3': 'darkelf_crystal.png', 'mat_darkelf_4': 'darkelf_void.png', 'mat_darkelf_5': 'darkelf_ash.png',
    'mat_seraphim_1': 'seraphim_feathe.png', 'mat_seraphim_2': 'seraphim_halo.png', 'mat_seraphim_3': 'seraphim_crystal.png', 'mat_seraphim_4': 'seraphim_core.png', 'mat_seraphim_5': 'seraphim_chalice.png',
    'mat_demon_1': 'demon_ember.png', 'mat_demon_2': 'demon_horn.png', 'mat_demon_3': 'demon_crystal.png', 'mat_demon_4': 'demon_flame.png', 'mat_demon_5': 'demon_crown.png',
    'mat_vampire_1': 'vampire_blood.png', 'mat_vampire_2': 'vampire_vial.png', 'mat_vampire_3': 'vampire_fang.png', 'mat_vampire_4': 'vampire_moon.png', 'mat_vampire_5': 'vampire_chalice.png',
    'mat_spirit_1': 'spirit_dust.png', 'mat_spirit_2': 'spirit_remnant.png', 'mat_spirit_3': 'spirit_crystal.png', 'mat_spirit_4': 'spirit_core.png', 'mat_spirit_5': 'spirit_pulse.png',
    'mat_hybrid_1': 'hybrid_claw.png', 'mat_hybrid_2': 'hybrid_fur.png', 'mat_hybrid_3': 'hybrid_bone.png', 'mat_hybrid_4': 'hybrid_crystal.png', 'mat_hybrid_5': 'hybrid_soul.png',
    'mat_dwarf_1': 'dwarf_copper.png', 'mat_dwarf_2': 'dwarf_bronze.png', 'mat_dwarf_3': 'dwarf_mithril.png', 'mat_dwarf_4': 'dwarf_heart.png', 'mat_dwarf_5': 'dwarf_hammer.png',
    'mat_ghoul_1': 'ghoul_bone.png', 'mat_ghoul_2': 'ghoul_remains.png', 'mat_ghoul_3': 'ghoul_skull.png', 'mat_ghoul_4': 'ghoul_crystal.png', 'mat_ghoul_5': 'ghoul_core.png',
    'book_general_1': 'gen_book_tactic.png', 'book_general_2': 'gen_book_combat.png', 'book_general_3': 'gen_book_arts.png', 'book_general_4': 'gen_book_war.png', 'book_general_5': 'gen_book_wisdom.png',
    'book_race_1': 'race_book_stone.png', 'book_race_2': 'race_book_ancestor.png', 'book_race_3': 'race_book_secrets.png', 'book_race_4': 'race_book_covenant.png', 'book_race_5': 'race_book_pact.png'
};

function resolveItemInfo(itemId) {
    if (upgradeMats && upgradeMats.weapon_materials) {
        for (const race of upgradeMats.weapon_materials) {
            const mat = race.materials.find(m => m.id === itemId);
            if (mat) return { name: mat.name, emoji: mat.emoji, category: 'materials', rarity: mat.rarity, imgPath: `images/materials/${race.race.toLowerCase().replace(' ', '_')}/${ID_TO_IMAGE[itemId] || itemId + '.png'}` };
        }
    }
    if (upgradeMats && upgradeMats.skill_books) {
        for (const cat of upgradeMats.skill_books) {
            const book = cat.books.find(b => b.id === itemId);
            const typeFolder = cat.category === 'General_Skills' ? 'general' : 'race';
            if (book) return { name: book.name, emoji: book.emoji, category: 'materials', rarity: book.rarity, imgPath: `images/materials/${typeFolder}/${ID_TO_IMAGE[itemId] || itemId + '.png'}` };
        }
    }
    if (fishData && fishData.length > 0) {
        const fish = fishData.find(f => f.id === itemId || f.name === itemId);
        if (fish) return { name: fish.name, emoji: fish.emoji || '🐟', category: 'fishing', rarity: fish.rarity > 3 ? 'Epic' : 'Common', imgPath: null };
    }
    if (farmItems && farmItems.length > 0) {
        const farmObj = farmItems.find(f => f.id === itemId || f.name === itemId);
        if (farmObj) return { name: farmObj.name, emoji: farmObj.emoji || '🌾', category: 'farming', rarity: 'Common', imgPath: null };
    }
    return { name: itemId, emoji: '📦', category: 'others', rarity: 'Common', imgPath: null };
}

const ITEMS_PER_PAGE = 15;

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

        const reply = async (payload) => {
            if (isSlash) {
                await interactionOrMessage.editReply(payload);
                return interactionOrMessage.fetchReply();
            }
            return interactionOrMessage.reply(payload);
        };

        if (!targetUser || targetUser.user.bot) return reply({ content: "❌ لا يمكن عرض حقيبة هذا العضو." });

        const userId = targetUser.id;
        const isOwnInventory = userId === user.id;

        let inventory = [], weapons = [], skills = [];
        try {
            const invRes = await db.query(`SELECT * FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]).catch(()=> db.query(`SELECT * FROM user_inventory WHERE userid = $1 AND guildid = $2`, [userId, guildId]));
            inventory = invRes?.rows || [];

            const wepRes = await db.query(`SELECT * FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]).catch(()=> db.query(`SELECT * FROM user_weapons WHERE userid = $1 AND guildid = $2`, [userId, guildId]));
            weapons = wepRes?.rows || [];

            const skillRes = await db.query(`SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]).catch(()=> db.query(`SELECT * FROM user_skills WHERE userid = $1 AND guildid = $2`, [userId, guildId]));
            skills = skillRes?.rows || [];
        } catch (e) {
            return reply({ content: "❌ حدث خطأ أثناء سحب بيانات الحقيبة." });
        }

        // 🔥 تنظيم الأقسام لتشمل القتال كصور 🔥
        const categories = { combat: [], materials: [], fishing: [], farming: [], others: [] };
        
        for (const row of inventory) {
            const itemId = row.itemID || row.itemid;
            const quantity = Number(row.quantity) || 0;
            if (quantity <= 0) continue;
            const itemInfo = resolveItemInfo(itemId);
            categories[itemInfo.category].push({ ...itemInfo, quantity, id: itemId });
        }

        // دمج الأسلحة والمهارات في قائمة مصورة
        if (weapons.length > 0) {
            const wData = weapons[0];
            const wConf = weaponsConfig.find(w => w.race === (wData.raceName || wData.racename));
            if (wConf) categories.combat.push({ name: wConf.name, emoji: wConf.emoji || '🗡️', quantity: wData.weaponLevel || wData.weaponlevel, rarity: 'Legendary', imgPath: null, id: 'weapon' });
        }
        if (skills.length > 0) {
            skills.forEach(s => {
                const sConf = skillsConfig.find(sc => sc.id === (s.skillID || s.skillid));
                if (sConf) categories.combat.push({ name: sConf.name, emoji: sConf.emoji || '📜', quantity: s.skillLevel || s.skilllevel, rarity: 'Epic', imgPath: null, id: s.skillID || s.skillid });
            });
        }

        let currentCategory = 'main';
        let currentPage = 1;

        // 🔥 نظام الأزرار الديناميكية (يتغير لون الزر حسب القسم المفتوح) 🔥
        const getCatButtons = () => {
            return new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`inv_cat_combat_${user.id}`).setLabel('معدات').setEmoji('⚔️').setStyle(currentCategory === 'combat' ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`inv_cat_materials_${user.id}`).setLabel('موارد').setEmoji('💎').setStyle(currentCategory === 'materials' ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`inv_cat_fishing_${user.id}`).setLabel('صيد').setEmoji('🎣').setStyle(currentCategory === 'fishing' ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`inv_cat_farming_${user.id}`).setLabel('مزرعة').setEmoji('🌾').setStyle(currentCategory === 'farming' ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`inv_cat_others_${user.id}`).setLabel('أخرى').setEmoji('🎒').setStyle(currentCategory === 'others' ? ButtonStyle.Success : ButtonStyle.Secondary)
            );
        };

        const getComponents = (catItems = []) => {
            const rows = [getCatButtons()];
            if (currentCategory !== 'main') {
                if (catItems.length > ITEMS_PER_PAGE) {
                    const totalPages = Math.ceil(catItems.length / ITEMS_PER_PAGE);
                    rows.push(new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`inv_prev_${user.id}`).setEmoji('⬅️').setStyle(ButtonStyle.Secondary).setDisabled(currentPage === 1),
                        new ButtonBuilder().setCustomId('inv_page_display').setLabel(`${currentPage}/${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
                        new ButtonBuilder().setCustomId(`inv_next_${user.id}`).setEmoji('➡️').setStyle(ButtonStyle.Secondary).setDisabled(currentPage === totalPages)
                    ));
                }
                if (isOwnInventory && currentCategory !== 'combat') {
                    rows.push(new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`inv_trade_init_${user.id}`).setLabel('مبادلة / إهداء عنصر 🤝').setStyle(ButtonStyle.Primary)
                    ));
                }
            }
            return rows;
        };

        // 🔥 الدالة السحرية لرسم الأقسام بدون أي Embeds 🔥
        const renderCategory = async (catName) => {
            const catTitles = { combat: 'الأسلحة والمهارات', materials: 'موارد التطوير', fishing: 'الصيد والأسماك', farming: 'المزرعة والزراعة', others: 'متفرقات' };
            
            if (catName === 'main') {
                let files = [];
                let mainBagPath = path.join(process.cwd(), 'images/inventory/main_bag.png');
                let contentStr = `**🎒 حقيبة الأبعاد لـ ${targetUser.displayName}**\n> حدد القسم الذي تود استكشافه من الأزرار:`;
                
                if (fs.existsSync(mainBagPath)) {
                    files.push(new AttachmentBuilder(mainBagPath, { name: 'main_bag.png' }));
                } else {
                    contentStr += `\nhttps://i.postimg.cc/85z1D8X3/main-bag-fallback.png`;
                }
                return { content: contentStr, embeds: [], components: getComponents(), files: files };
            }

            const items = categories[catName];
            if (items.length === 0) {
                return { content: `**🎒 ${targetUser.displayName} | [ ${catTitles[catName]} ]**\n> ❌ هذه الحقيبة فارغة تماماً.`, embeds: [], components: getComponents(items), files: [] };
            }

            const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
            if (currentPage > totalPages) currentPage = totalPages;
            if (currentPage < 1) currentPage = 1;
            
            const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
            const pageItems = items.slice(startIdx, startIdx + ITEMS_PER_PAGE);

            if (generateInventoryCard) {
                const imgBuffer = await generateInventoryCard(targetUser.displayName, catTitles[catName], pageItems, currentPage, totalPages);
                const attachment = new AttachmentBuilder(imgBuffer, { name: 'inventory_card.png' });
                return { content: `**🎒 ${targetUser.displayName} | [ ${catTitles[catName]} ]**`, embeds: [], components: getComponents(items), files: [attachment] };
            } else {
                let desc = `**🎒 ${targetUser.displayName} | [ ${catTitles[catName]} ]**\n\n`;
                pageItems.forEach(item => { desc += `> ${item.emoji} **${item.name}** : \`${item.quantity}\`\n`; });
                return { content: desc, embeds: [], components: getComponents(items), files: [] };
            }
        };

        const msg = await reply(await renderCategory('main'));

        const filter = i => i.user.id === user.id && i.customId.includes(user.id);
        const collector = msg.createMessageComponentCollector({ filter, time: 300000 });

        let tradeState = { itemID: null, targetID: null };

        collector.on('collect', async (i) => {
            // معالجة التنقل بين الأقسام
            if (i.customId.startsWith('inv_cat_')) {
                try { await i.deferUpdate(); } catch(e) { return; }
                currentCategory = i.customId.split('_')[2];
                currentPage = 1;
                await msg.edit(await renderCategory(currentCategory)).catch(()=>{});
            }
            else if (i.customId === `inv_next_${user.id}`) {
                try { await i.deferUpdate(); } catch(e) { return; }
                currentPage++;
                await msg.edit(await renderCategory(currentCategory)).catch(()=>{});
            }
            else if (i.customId === `inv_prev_${user.id}`) {
                try { await i.deferUpdate(); } catch(e) { return; }
                currentPage--;
                await msg.edit(await renderCategory(currentCategory)).catch(()=>{});
            }
            // نظام التبادل
            else if (i.customId === `inv_trade_init_${user.id}`) {
                if (currentCategory === 'combat') {
                    return i.reply({ content: '❌ الأسلحة والمهارات مرتبطة بروحك ولا يمكن مبادلتها!', flags: [MessageFlags.Ephemeral] });
                }

                const tradableItems = categories[currentCategory];
                if (tradableItems.length === 0) return i.reply({ content: '❌ لا تملك أي عناصر للتبادل.', flags: [MessageFlags.Ephemeral] });

                const options = tradableItems.slice(0, 25).map(item => {
                    return { label: item.name, value: item.id, emoji: item.emoji || '📦', description: `الكمية المتاحة: ${item.quantity}` };
                });

                const itemSelect = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId(`inv_trade_item_${user.id}`).setPlaceholder('اختر العنصر الذي تريد إرساله...').addOptions(options)
                );

                await i.update({ components: [itemSelect] }).catch(()=>{});
            }
            else if (i.isStringSelectMenu() && i.customId === `inv_trade_item_${user.id}`) {
                tradeState.itemID = i.values[0];
                const userSelect = new ActionRowBuilder().addComponents(
                    new UserSelectMenuBuilder().setCustomId(`inv_trade_target_${user.id}`).setPlaceholder('اختر اللاعب الذي تريد التعامل معه...')
                );
                await i.update({ components: [userSelect] }).catch(()=>{});
            }
            else if (i.isUserSelectMenu() && i.customId === `inv_trade_target_${user.id}`) {
                tradeState.targetID = i.values[0];

                if (tradeState.targetID === user.id) return i.reply({ content: '❌ لا يمكنك التبادل مع نفسك!', flags: [MessageFlags.Ephemeral] });
                const targetUserObj = await client.users.fetch(tradeState.targetID).catch(()=>null);
                if (targetUserObj && targetUserObj.bot) return i.reply({ content: '❌ لا يمكنك التبادل مع البوتات!', flags: [MessageFlags.Ephemeral] });

                const modal = new ModalBuilder().setCustomId(`inv_trade_modal_${user.id}`).setTitle('إعدادات المبادلة');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trade_qty').setLabel('الكمية المراد إرسالها').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trade_price').setLabel('السعر (مورا) - ضع 0 إذا كانت هدية').setStyle(TextInputStyle.Short).setValue('0').setRequired(true))
                );
                await i.showModal(modal).catch(()=>{});

                try {
                    const modalSubmit = await i.awaitModalSubmit({ filter: m => m.user.id === user.id && m.customId === `inv_trade_modal_${user.id}`, time: 60000 });
                    const qty = parseInt(modalSubmit.fields.getTextInputValue('trade_qty'));
                    const price = parseInt(modalSubmit.fields.getTextInputValue('trade_price'));

                    if (isNaN(qty) || qty <= 0) return modalSubmit.reply({ content: '❌ كمية غير صالحة.', flags: [MessageFlags.Ephemeral] });
                    if (isNaN(price) || price < 0) return modalSubmit.reply({ content: '❌ سعر غير صالح.', flags: [MessageFlags.Ephemeral] });

                    let checkInv = await db.query(`SELECT "quantity", "id" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guildId, tradeState.itemID]).catch(()=> db.query(`SELECT quantity, id FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guildId, tradeState.itemID]));
                    const senderInvData = checkInv?.rows[0];
                    
                    if (!senderInvData || Number(senderInvData.quantity) < qty) {
                        return modalSubmit.reply({ content: '❌ أنت لا تملك هذه الكمية في حقيبتك!', flags: [MessageFlags.Ephemeral] });
                    }

                    const itemInfo = resolveItemInfo(tradeState.itemID);

                    if (price === 0) {
                        await db.query('BEGIN').catch(()=>{});
                        const newSenderQty = Number(senderInvData.quantity) - qty;
                        if (newSenderQty > 0) {
                            await db.query(`UPDATE user_inventory SET "quantity" = $1 WHERE "id" = $2`, [newSenderQty, senderInvData.id]).catch(()=> db.query(`UPDATE user_inventory SET quantity = $1 WHERE id = $2`, [newSenderQty, senderInvData.id]));
                        } else {
                            await db.query(`DELETE FROM user_inventory WHERE "id" = $1`, [senderInvData.id]).catch(()=> db.query(`DELETE FROM user_inventory WHERE id = $1`, [senderInvData.id]));
                        }

                        await db.query(`INSERT INTO user_inventory ("userID", "guildID", "itemID", "quantity") VALUES ($1, $2, $3, $4) ON CONFLICT ("userID", "guildID", "itemID") DO UPDATE SET "quantity" = user_inventory."quantity" + $4`, [tradeState.targetID, guildId, tradeState.itemID, qty]).catch(()=> db.query(`INSERT INTO user_inventory (userid, guildid, itemid, quantity) VALUES ($1, $2, $3, $4) ON CONFLICT (userid, guildid, itemid) DO UPDATE SET quantity = user_inventory.quantity + $4`, [tradeState.targetID, guildId, tradeState.itemID, qty]));
                        await db.query('COMMIT').catch(()=>{});

                        await modalSubmit.reply({ content: `🎁 <@${user.id}> أرسل **${qty}x ${itemInfo.emoji} ${itemInfo.name}** كهدية إلى <@${tradeState.targetID}>!` });
                        
                        inventory = inventory.map(r => r.id === senderInvData.id ? { ...r, quantity: newSenderQty } : r).filter(r => Number(r.quantity) > 0);
                        const cItems = categories[currentCategory];
                        const idx = cItems.findIndex(c => c.id === tradeState.itemID);
                        if(idx > -1) { cItems[idx].quantity -= qty; if(cItems[idx].quantity <= 0) cItems.splice(idx, 1); }

                        await msg.edit(await renderCategory(currentCategory)).catch(()=>{});
                    } else {
                        await modalSubmit.deferReply();
                        const tradeId = Date.now().toString();
                        const tradeButtons = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`trade_acc_${tradeId}`).setLabel('قبول وشراء ✅').setStyle(ButtonStyle.Success),
                            new ButtonBuilder().setCustomId(`trade_dec_${tradeId}`).setLabel('رفض ❌').setStyle(ButtonStyle.Danger)
                        );

                        const tradeMsgObj = await modalSubmit.followUp({ content: `⚖️ **عـقـد تـجـاري**\nمرحباً <@${tradeState.targetID}>!\nيعرض عليك <@${user.id}>:\n**استلام:** ${qty}x ${itemInfo.emoji} ${itemInfo.name}\n**دفع:** ${price.toLocaleString()} ${EMOJI_MORA}`, components: [tradeButtons] });
                        msg.edit(await renderCategory(currentCategory)).catch(()=>{});

                        const tradeFilter = btn => btn.user.id === tradeState.targetID && btn.customId.includes(tradeId);
                        const tradeCollector = tradeMsgObj.createMessageComponentCollector({ filter: tradeFilter, time: 60000 });

                        tradeCollector.on('collect', async btn => {
                            await btn.deferUpdate().catch(()=>{});
                            if (btn.customId.includes('dec_')) {
                                tradeCollector.stop('declined');
                                return tradeMsgObj.edit({ content: `❌ تم رفض الصفقة من قبل <@${tradeState.targetID}>.`, components: [] });
                            }

                            const targetLvlRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [tradeState.targetID, guildId]).catch(()=> db.query(`SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [tradeState.targetID, guildId]));
                            const targetMora = targetLvlRes?.rows[0] ? Number(targetLvlRes.rows[0].mora) : 0;
                            if (targetMora < price) return btn.followUp({ content: '❌ لا تملك المورا الكافية!', flags: [MessageFlags.Ephemeral] });

                            const checkInvFinal = await db.query(`SELECT "quantity", "id" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guildId, tradeState.itemID]).catch(()=> db.query(`SELECT quantity, id FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guildId, tradeState.itemID]));
                            const senderInvFinal = checkInvFinal?.rows[0];
                            
                            if (!senderInvFinal || Number(senderInvFinal.quantity) < qty) {
                                tradeCollector.stop('failed');
                                return tradeMsgObj.edit({ content: `❌ فشلت الصفقة: البائع لا يملك الكمية المطلوبة حالياً!`, components: [] });
                            }

                            try {
                                await db.query('BEGIN').catch(()=>{});
                                const finalSenderQty = Number(senderInvFinal.quantity) - qty;
                                if (finalSenderQty > 0) {
                                    await db.query(`UPDATE user_inventory SET "quantity" = $1 WHERE "id" = $2`, [finalSenderQty, senderInvFinal.id]).catch(()=> db.query(`UPDATE user_inventory SET quantity = $1 WHERE id = $2`, [finalSenderQty, senderInvFinal.id]));
                                } else {
                                    await db.query(`DELETE FROM user_inventory WHERE "id" = $1`, [senderInvFinal.id]).catch(()=> db.query(`DELETE FROM user_inventory WHERE id = $1`, [senderInvFinal.id]));
                                }
                                
                                await db.query(`INSERT INTO user_inventory ("userID", "guildID", "itemID", "quantity") VALUES ($1, $2, $3, $4) ON CONFLICT ("userID", "guildID", "itemID") DO UPDATE SET "quantity" = user_inventory."quantity" + $4`, [tradeState.targetID, guildId, tradeState.itemID, qty]).catch(()=> db.query(`INSERT INTO user_inventory (userid, guildid, itemid, quantity) VALUES ($1, $2, $3, $4) ON CONFLICT (userid, guildid, itemid) DO UPDATE SET quantity = user_inventory.quantity + $4`, [tradeState.targetID, guildId, tradeState.itemID, qty]));
                                await db.query(`UPDATE levels SET "mora" = "mora" - $1 WHERE "user" = $2 AND "guild" = $3`, [price, tradeState.targetID, guildId]).catch(()=> db.query(`UPDATE levels SET mora = mora - $1 WHERE userid = $2 AND guildid = $3`, [price, tradeState.targetID, guildId]));
                                await db.query(`UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3`, [price, user.id, guildId]).catch(()=> db.query(`UPDATE levels SET mora = mora + $1 WHERE userid = $2 AND guildid = $3`, [price, user.id, guildId]));
                                await db.query('COMMIT').catch(()=>{});

                                tradeCollector.stop('accepted');
                                await tradeMsgObj.edit({ content: `✅ **تمت الصفقة بنجاح!**\nاشترى <@${tradeState.targetID}> ${qty}x ${itemInfo.name} مقابل ${price.toLocaleString()} ${EMOJI_MORA} من <@${user.id}>.`, components: [] });

                                inventory = inventory.map(r => r.id === senderInvFinal.id ? { ...r, quantity: finalSenderQty } : r).filter(r => Number(r.quantity) > 0);
                                const cItems = categories[currentCategory];
                                const idx = cItems.findIndex(c => c.id === tradeState.itemID);
                                if(idx > -1) { cItems[idx].quantity -= qty; if(cItems[idx].quantity <= 0) cItems.splice(idx, 1); }

                                await msg.edit(await renderCategory(currentCategory)).catch(()=>{});
                            } catch (e) {
                                await db.query('ROLLBACK').catch(()=>{});
                                tradeCollector.stop('error');
                                await tradeMsgObj.edit({ content: `❌ حدث خطأ فني.`, components: [] });
                            }
                        });

                        tradeCollector.on('end', (collected, reason) => {
                            if (reason === 'time') tradeMsgObj.edit({ content: `⏳ انتهى وقت العرض.`, components: [] }).catch(()=>{});
                        });
                    }
                } catch (e) {
                    try { msg.edit(await renderCategory(currentCategory)); } catch(err) {}
                }
            }
        });

        collector.on('end', () => {
            try { msg.edit({ components: [] }).catch(()=>{}); } catch(e) {}
        });
    }
};
