const { EmbedBuilder, Colors, MessageFlags, ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType } = require("discord.js");

// ✅ [تصحيح] تم تعديل المسار هنا ليقرأ الملف من نفس المجلد
const { sendLevelUpMessage } = require('./handler-utils.js'); 

// 🔥 استيراد الملفين بشكل منفصل 🔥
const shopItems = require('../json/shop-items.json'); // العناصر العامة
const potionItems = require('../json/potions.json'); // الجرعات

const farmAnimals = require('../json/farm-animals.json');
const weaponsConfig = require('../json/weapons-config.json');
const skillsConfig = require('../json/skills-config.json');
const path = require('path');

// استيراد ملف الصيد الشامل
const rootDir = process.cwd();
let rodsConfig = [], boatsConfig = [], baitsConfig = [];
try {
    const fishingConfig = require(path.join(rootDir, 'json', 'fishing-config.json'));
    rodsConfig = fishingConfig.rods || [];
    boatsConfig = fishingConfig.boats || [];
    baitsConfig = fishingConfig.baits || [];
} catch (e) { console.error("Error loading fishing config:", e); }

const EMOJI_MORA = '<:mora:1435647151349698621>';
const OWNER_ID = "1145327691772481577"; 
const XP_EXCHANGE_RATE = 3;
const BANNER_URL = 'https://i.postimg.cc/NMkWVyLV/line.png';

const THUMBNAILS = new Map([
    ['upgrade_weapon', 'https://i.postimg.cc/CMXxsXT1/tsmym-bdwn-ʿnwan-7.png'],
    ['upgrade_skill', 'https://i.postimg.cc/CMkxJJF4/tsmym-bdwn-ʿnwan-8.png'],
    ['upgrade_rod', 'https://i.postimg.cc/Wz0g0Zg0/fishing.png'], 
    ['upgrade_boat', 'https://i.postimg.cc/Wz0g0Zg0/fishing.png'], 
    ['exchange_xp', 'https://i.postimg.cc/2yKbQSd3/tsmym-bdwn-ʿnwan-6.png'],
    ['personal_guard_1d', 'https://i.postimg.cc/CMv2qp8n/tsmym-bdwn-ʿnwan-1.png'],
    ['streak_shield', 'https://i.postimg.cc/3rbLwCMj/tsmym-bdwn-ʿnwan-2.png'],
    ['streak_shield_media', 'https://i.postimg.cc/3rbLwCMj/tsmym-bdwn-ʿnwan-2.png'],
    ['xp_buff_1d_3', 'https://i.postimg.cc/TP9zNLK4/tsmym-bdwn-ʿnwan-3.png'],
    ['xp_buff_1d_7', 'https://i.postimg.cc/Gmn6cJYG/tsmym-bdwn-ʿnwan-4.png'],
    ['xp_buff_2d_10', 'https://i.postimg.cc/NFrPt5jN/tsmym-bdwn-ʿnwan-5.png'],
    ['vip_role_3d', 'https://i.postimg.cc/4drRpC7d/2.webp'],
    ['discord_effect_5', 'https://i.postimg.cc/50QZ4PPL/1.webp'],
    ['discord_effect_10', 'https://i.postimg.cc/tJHmX9nh/3.webp'],
    ['nitro_basic', 'https://i.postimg.cc/Qxmn3G8K/5.webp'],
    ['nitro_gaming', 'https://i.postimg.cc/kXJfw1Q4/6.webp'],
    ['change_race', 'https://i.postimg.cc/rs4mmjvs/tsmym-bdwn-ʿnwan-9.png'],
    ['item_temp_reply', 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png'],
    ['potions_menu', 'https://cdn-icons-png.flaticon.com/512/867/867927.png']
]);

// 🌟 دالة للتأكد من وجود جدول المخزون (Inventory) 🌟
function ensureInventoryTable(sql) {
    if(!sql.open) return;
    sql.prepare(`
        CREATE TABLE IF NOT EXISTS user_inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guildID TEXT,
            userID TEXT,
            itemID TEXT,
            quantity INTEGER DEFAULT 0,
            UNIQUE(guildID, userID, itemID)
        );
    `).run();
}

// 🌟 دالة اللوج (تسجيل العمليات) 🌟
async function sendShopLog(client, guildId, member, item, price, type = "شراء") {
    try {
        const settings = client.sql.prepare("SELECT shopLogChannelID FROM settings WHERE guild = ?").get(guildId);
        if (!settings || !settings.shopLogChannelID) return;
        const channel = await client.channels.fetch(settings.shopLogChannelID).catch(() => null);
        if (!channel) return;
        const embed = new EmbedBuilder()
            .setTitle(`🛒 سجل عمليات المتجر`)
            .setColor(type.includes("بيع") ? Colors.Green : Colors.Gold)
            .addFields(
                { name: '👤 العضو', value: `${member} \n(\`${member.id}\`)`, inline: true },
                { name: '📦 العنصر', value: `**${item}**`, inline: true },
                { name: '💰 المبلغ', value: `**${price.toLocaleString()}** ${EMOJI_MORA}`, inline: true },
                { name: '🏷️ نوع العملية', value: type, inline: true },
                { name: '⏰ الوقت', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
            )
            .setThumbnail(member.user.displayAvatarURL())
            .setTimestamp();
        await channel.send({ embeds: [embed] });
    } catch (e) { console.error("[Shop Log Error]", e.message); }
}

function updateMarketPrices() {
    const sql = require('better-sqlite3')('./mainDB.sqlite');
    if (!sql.open) return;
    try {
        const allItems = sql.prepare("SELECT * FROM market_items").all();
        if (allItems.length === 0) return;
        const updateStmt = sql.prepare(`UPDATE market_items SET currentPrice = ?, lastChangePercent = ?, lastChange = ? WHERE id = ?`);
        const SATURATION_POINT = 2000; const MIN_PRICE = 10; const MAX_PRICE = 50000;        
        const transaction = sql.transaction(() => {
            for (const item of allItems) {
                const result = sql.prepare("SELECT SUM(quantity) as total FROM user_portfolio WHERE itemID = ?").get(item.id);
                const totalOwned = result.total || 0;
                let randomPercent = (Math.random() * 0.20) - 0.10;
                const saturationPenalty = (totalOwned / SATURATION_POINT) * 0.02;
                let finalChangePercent = randomPercent - saturationPenalty;
                if (item.currentPrice > 5000 && finalChangePercent > 0) finalChangePercent /= 2; 
                if (finalChangePercent < -0.30) finalChangePercent = -0.30;
                const oldPrice = item.currentPrice;
                let newPrice = Math.floor(oldPrice * (1 + finalChangePercent));
                if (newPrice < MIN_PRICE) newPrice = MIN_PRICE;
                if (newPrice > MAX_PRICE) newPrice = MAX_PRICE;
                const changeAmount = newPrice - oldPrice;
                const displayPercent = oldPrice > 0 ? ((changeAmount / oldPrice) * 100).toFixed(2) : 0;
                updateStmt.run(newPrice, displayPercent, changeAmount, item.id);
            }
        });
        transaction();
        console.log(`[Market] Prices updated (Saturation Logic Applied).`);
    } catch (err) { console.error("[Market] Error updating prices:", err.message); }
}

function getBuyableItems() { 
    return shopItems.filter(it => 
        it.category !== 'menus' && 
        !['upgrade_weapon', 'upgrade_skill', 'exchange_xp', 'upgrade_rod', 'fishing_gear_menu', 'potions_menu'].includes(it.id)
    ); 
}

function getPotionItems() {
    return potionItems; 
}

function getGeneralSkills() { return skillsConfig.filter(s => s.id.startsWith('skill_')); }

function getRaceSkillConfig(raceName) { 
    if (!raceName) return null;
    return skillsConfig.find(s => {
        if (!s.id.startsWith('race_')) return false;
        const idName = s.id.replace('race_', '').replace('_skill', '').replace(/_/g, ' ').toLowerCase();
        return idName === raceName.toLowerCase();
    }); 
}

function getUserRace(member, sql) { 
    if (!member || !member.roles) return null;
    const allRaceRoles = sql.prepare("SELECT roleID, raceName FROM race_roles WHERE guildID = ?").all(member.guild.id); 
    const userRoleIDs = member.roles.cache.map(r => r.id); 
    const userRace = allRaceRoles.find(r => userRoleIDs.includes(r.roleID)); 
    return userRace || null; 
}

function getAllUserAvailableSkills(member, sql) { 
    const generalSkills = getGeneralSkills(); 
    const userRace = getUserRace(member, sql); 
    let raceSkill = null; 
    if (userRace) { raceSkill = getRaceSkillConfig(userRace.raceName); } 
    let allSkills = []; 
    if (raceSkill) { allSkills.push(raceSkill); } 
    allSkills = allSkills.concat(generalSkills); 
    return allSkills; 
}

function calculateSlippage(basePrice, quantity, isBuy) {
    const slippageFactor = 0.0001; 
    const impact = quantity * slippageFactor;
    let avgPrice;
    if (isBuy) { avgPrice = basePrice * (1 + (impact / 2)); } 
    else { avgPrice = basePrice * (1 - (impact / 2)); }
    return Math.max(Math.floor(avgPrice), 1);
}

// ... (نظام الكوبونات ودالة processFinalPurchase المعدلة) ...
async function handlePurchaseWithCoupons(interaction, itemData, quantity, totalPrice, client, sql, callbackType) {
    const member = interaction.member; const guildID = interaction.guild.id; const userID = member.id;
    const bossCoupon = sql.prepare("SELECT * FROM user_coupons WHERE guildID = ? AND userID = ? AND isUsed = 0 LIMIT 1").get(guildID, userID);
    const roleCouponsConfig = sql.prepare("SELECT * FROM role_coupons_config WHERE guildID = ?").all(guildID);
    let bestRoleCoupon = null;
    for (const config of roleCouponsConfig) {
        if (member.roles.cache.has(config.roleID)) {
            if (!bestRoleCoupon || config.discountPercent > bestRoleCoupon.discountPercent) bestRoleCoupon = config;
        }
    }
    let isRoleCouponReady = false;
    if (bestRoleCoupon) {
        const usageData = sql.prepare("SELECT lastUsedTimestamp FROM user_role_coupon_usage WHERE guildID = ? AND userID = ?").get(guildID, userID);
        const fifteenDaysMs = 15 * 24 * 60 * 60 * 1000;
        if (!usageData || (Date.now() - usageData.lastUsedTimestamp > fifteenDaysMs)) isRoleCouponReady = true; else bestRoleCoupon = null; 
    }
    if (!bossCoupon && !bestRoleCoupon) return processFinalPurchase(interaction, itemData, quantity, totalPrice, 0, 'none', client, sql, callbackType);

    const row = new ActionRowBuilder();
    let couponMessage = "";
    let finalPriceWithBoss = totalPrice;
    let finalPriceWithRole = totalPrice;

    if (bossCoupon) {
        finalPriceWithBoss = Math.floor(totalPrice * (1 - (bossCoupon.discountPercent / 100)));
        couponMessage += `✶ لديـك كـوبـون خـصم بقيـمـة: **${bossCoupon.discountPercent}%** هل تريـد استعمـالـه؟\n✬ اذا استعملته ستدفـع: **${finalPriceWithBoss.toLocaleString()}** ${EMOJI_MORA} - بدلاً مـن: **${totalPrice.toLocaleString()}**\n\n`;
        row.addComponents(new ButtonBuilder().setCustomId('use_boss_coupon').setLabel(`استعمـال (${bossCoupon.discountPercent}%)`).setStyle(ButtonStyle.Success).setEmoji('🎫'));
    }
    if (bestRoleCoupon && isRoleCouponReady) {
        finalPriceWithRole = Math.floor(totalPrice * (1 - (bestRoleCoupon.discountPercent / 100)));
        couponMessage += `✶ لديـك كـوبـون خـصم بقيـمـة: **${bestRoleCoupon.discountPercent}%** هل تريـد استعمـالـه؟\n✬ اذا استعملته ستدفـع: **${finalPriceWithRole.toLocaleString()}** ${EMOJI_MORA} - بدلاً مـن: **${totalPrice.toLocaleString()}**\n\n`;
        row.addComponents(new ButtonBuilder().setCustomId('use_role_coupon').setLabel(`استعمـال (${bestRoleCoupon.discountPercent}%)`).setStyle(ButtonStyle.Success).setEmoji('🛡️'));
    }
    row.addComponents(new ButtonBuilder().setCustomId('skip_coupon').setLabel('تخـطـي (دفع كامل)').setStyle(ButtonStyle.Primary));

    const replyData = { content: `**🛍️ خيـارات الـدفع:**\n\n${couponMessage}`, components: [row], flags: MessageFlags.Ephemeral, fetchReply: true };
    let msg; if (interaction.replied || interaction.deferred) msg = await interaction.followUp(replyData); else msg = await interaction.reply(replyData);
    const filter = i => i.user.id === userID;
    const collector = msg.createMessageComponentCollector({ filter, componentType: ComponentType.Button, time: 60000 });
    collector.on('collect', async i => {
        await i.deferUpdate(); await i.editReply({ content: "⏳ جاري تنفيذ الطلب...", components: [] });
        if (i.customId === 'skip_coupon') await processFinalPurchase(i, itemData, quantity, totalPrice, 0, 'none', client, sql, callbackType);
        else if (i.customId === 'use_boss_coupon') await processFinalPurchase(i, itemData, quantity, finalPriceWithBoss, bossCoupon.discountPercent, 'boss', client, sql, callbackType, bossCoupon.id);
        else if (i.customId === 'use_role_coupon') await processFinalPurchase(i, itemData, quantity, finalPriceWithRole, bestRoleCoupon.discountPercent, 'role', client, sql, callbackType);
        collector.stop();
    });
}

async function processFinalPurchase(interaction, itemData, quantity, finalPrice, discountUsed, couponType, client, sql, callbackType, couponIdToDelete = null) {
    let userData = client.getLevel.get(interaction.user.id, interaction.guild.id);
    if (!userData) userData = { ...client.defaultData, user: interaction.user.id, guild: interaction.guild.id };
    
    const safeReply = async (payload) => {
        payload.flags = MessageFlags.Ephemeral; 
        if (interaction.deferred || interaction.replied) return await interaction.followUp(payload); else return await interaction.reply(payload);
    };

    if (userData.mora < finalPrice) {
        const userBank = userData.bank || 0; 
        let errorMsg = `❌ **عذراً، لا تملك مورا كافية!**\nالمطلوب بالكاش: **${finalPrice.toLocaleString()}** ${EMOJI_MORA}`;
        if (userBank >= finalPrice) errorMsg += `\n\n💡 **تلميح:** ليس لديك كاش كافٍ، ولكن لديك **${userBank.toLocaleString()}** في البنك.`;
        return await safeReply({ content: errorMsg });
    }

    // خصم المبلغ وتحديث المشتريات
    userData.mora -= finalPrice; 
    userData.shop_purchases = (userData.shop_purchases || 0) + 1;
    
    if (couponType === 'boss' && couponIdToDelete) sql.prepare("DELETE FROM user_coupons WHERE id = ?").run(couponIdToDelete);
    else if (couponType === 'role') sql.prepare("INSERT OR REPLACE INTO user_role_coupon_usage (guildID, userID, lastUsedTimestamp) VALUES (?, ?, ?)").run(interaction.guild.id, interaction.user.id, Date.now());

    // تنفيذ عملية الشراء بناءً على النوع
    if (callbackType === 'item') {
        if (itemData.id === 'personal_guard_1d') { userData.hasGuard = (userData.hasGuard || 0) + 3; userData.guardExpires = 0; }
        // 🔥🔥 إصلاح: الجرعات تذهب للمخزون (inventory) 🔥🔥
        else if (itemData.category === 'potions') { 
            ensureInventoryTable(sql); 
            sql.prepare("INSERT INTO user_inventory (guildID, userID, itemID, quantity) VALUES (?, ?, ?, 1) ON CONFLICT(guildID, userID, itemID) DO UPDATE SET quantity = quantity + 1").run(interaction.guild.id, interaction.user.id, itemData.id); 
        }
        else if (itemData.id === 'streak_shield') {
            const setStreak = sql.prepare("INSERT OR REPLACE INTO streaks (id, guildID, userID, streakCount, lastMessageTimestamp, hasGracePeriod, hasItemShield, nicknameActive, hasReceivedFreeShield, separator, dmNotify, highestStreak) VALUES (@id, @guildID, @userID, @streakCount, @lastMessageTimestamp, @hasGracePeriod, @hasItemShield, @nicknameActive, @hasReceivedFreeShield, @separator, @dmNotify, @highestStreak);");
            const existingStreak = sql.prepare("SELECT * FROM streaks WHERE userID = ? AND guildID = ?").get(interaction.user.id, interaction.guild.id);
            const fullStreakData = { id: existingStreak?.id || `${interaction.guild.id}-${interaction.user.id}`, guildID: interaction.guild.id, userID: interaction.user.id, streakCount: existingStreak?.streakCount || 0, lastMessageTimestamp: existingStreak?.lastMessageTimestamp || 0, hasGracePeriod: existingStreak?.hasGracePeriod || 0, hasItemShield: 1, nicknameActive: existingStreak?.nicknameActive ?? 1, hasReceivedFreeShield: existingStreak?.hasReceivedFreeShield || 0, separator: existingStreak?.separator || '»', dmNotify: existingStreak?.dmNotify ?? 1, highestStreak: existingStreak?.highestStreak || 0 };
            setStreak.run(fullStreakData);
        }
        else if (itemData.id === 'streak_shield_media') {
            const setMediaStreak = sql.prepare("INSERT OR REPLACE INTO media_streaks (id, guildID, userID, streakCount, lastMediaTimestamp, hasGracePeriod, hasItemShield, hasReceivedFreeShield, dmNotify, highestStreak) VALUES (@id, @guildID, @userID, @streakCount, @lastMediaTimestamp, @hasGracePeriod, @hasItemShield, @hasReceivedFreeShield, @dmNotify, @highestStreak);");
            const existingMediaStreak = sql.prepare("SELECT * FROM media_streaks WHERE userID = ? AND guildID = ?").get(interaction.user.id, interaction.guild.id);
            const fullMediaStreakData = { id: existingMediaStreak?.id || `${interaction.guild.id}-${interaction.user.id}`, guildID: interaction.guild.id, userID: interaction.user.id, streakCount: existingMediaStreak?.streakCount || 0, lastMediaTimestamp: existingMediaStreak?.lastMediaTimestamp || 0, hasGracePeriod: existingMediaStreak?.hasGracePeriod || 0, hasItemShield: 1, hasReceivedFreeShield: existingMediaStreak?.hasReceivedFreeShield || 0, dmNotify: existingMediaStreak?.dmNotify ?? 1, highestStreak: existingMediaStreak?.highestStreak || 0 };
            setMediaStreak.run(fullMediaStreakData);
        }
        else if (itemData.id.startsWith('xp_buff_')) {
            let multiplier = 0, buffPercent = 0, duration = 0;
            switch (itemData.id) {
                case 'xp_buff_1d_3': multiplier = 0.45; buffPercent = 45; duration = 24 * 60 * 60 * 1000; break;
                case 'xp_buff_1d_7': multiplier = 0.70; buffPercent = 70; duration = 48 * 60 * 60 * 1000; break;
                case 'xp_buff_2d_10': multiplier = 0.90; buffPercent = 90; duration = 72 * 60 * 60 * 1000; break;
            }
            if (duration > 0) {
                const expiresAt = Date.now() + duration;
                sql.prepare("INSERT INTO user_buffs (userID, guildID, buffType, multiplier, expiresAt, buffPercent) VALUES (?, ?, ?, ?, ?, ?)").run(interaction.user.id, interaction.guild.id, 'xp', multiplier, expiresAt, buffPercent);
            }
        }
        else if (itemData.id === 'vip_role_3d') {
            const settings = sql.prepare("SELECT vipRoleID FROM settings WHERE guild = ?").get(interaction.guild.id);
            if (settings && settings.vipRoleID) {
                const member = await interaction.guild.members.fetch(interaction.user.id);
                await member.roles.add(settings.vipRoleID);
                const expiresAt = Date.now() + (3 * 24 * 60 * 60 * 1000);
                sql.prepare("INSERT OR REPLACE INTO temporary_roles (userID, guildID, roleID, expiresAt) VALUES (?, ?, ?, ?)").run(interaction.user.id, interaction.guild.id, settings.vipRoleID, expiresAt);
            }
        }
        else if (itemData.id === 'change_race') {
            try {
                const allRaceRoles = sql.prepare("SELECT roleID, raceName FROM race_roles WHERE guildID = ?").all(interaction.guild.id);
                const raceRoleIDs = allRaceRoles.map(r => r.roleID);
                const userRaceRole = interaction.member.roles.cache.find(r => raceRoleIDs.includes(r.id));
                if (userRaceRole) { await interaction.member.roles.remove(userRaceRole); }
            } catch (err) {}
            const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000);
            sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(interaction.guild.id, interaction.user.id, -5, expiresAt, 'xp', -0.05);
            sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(interaction.guild.id, interaction.user.id, -5, expiresAt, 'mora', -0.05);
        }
    } 
    else if (callbackType === 'weapon') {
        const newLevel = itemData.currentLevel + 1;
        if (itemData.isBuy) sql.prepare("INSERT INTO user_weapons (userID, guildID, raceName, weaponLevel) VALUES (?, ?, ?, ?)").run(interaction.user.id, interaction.guild.id, itemData.raceName, newLevel);
        else sql.prepare("UPDATE user_weapons SET weaponLevel = ? WHERE userID = ? AND guildID = ? AND raceName = ?").run(newLevel, interaction.user.id, interaction.guild.id, itemData.raceName);
    } 
    else if (callbackType === 'skill') {
        const newLevel = itemData.currentLevel + 1;
        if (itemData.isBuy) sql.prepare("INSERT INTO user_skills (userID, guildID, skillID, skillLevel) VALUES (?, ?, ?, ?)").run(interaction.user.id, interaction.guild.id, itemData.skillId, newLevel);
        else sql.prepare("UPDATE user_skills SET skillLevel = ? WHERE id = ?").run(newLevel, itemData.dbId);
    }
    
    client.setLevel.run(userData);
    
    let successMsg = `✅ **تمت العملية بنجاح!**\n📦 **العنصر:** ${itemData.name || itemData.raceName || 'Unknown'}\n💰 **المبلغ المدفوع:** ${finalPrice.toLocaleString()} ${EMOJI_MORA}`;
    if (discountUsed > 0) successMsg += `\n📉 **تم تطبيق خصم:** ${discountUsed}%`;
    
    await safeReply({ content: successMsg });
    sendShopLog(client, interaction.guild.id, interaction.member, itemData.name || itemData.raceName || "Unknown", finalPrice, `شراء ${discountUsed > 0 ? '(مع كوبون)' : ''}`);
}

function buildPaginatedItemEmbed(selectedItemId) {
    const isPotion = potionItems.find(i => i.id === selectedItemId);
    const itemList = isPotion ? potionItems : getBuyableItems();

    const itemIndex = itemList.findIndex(it => it.id === selectedItemId);
    if (itemIndex === -1) return null;

    const item = itemList[itemIndex];
    const totalItems = itemList.length;
    const prevIndex = (itemIndex - 1 + totalItems) % totalItems;
    const nextIndex = (itemIndex + 1) % totalItems;
    const prevItemId = itemList[prevIndex].id;
    const nextItemId = itemList[nextIndex].id;

    const detailEmbed = new EmbedBuilder()
        .setTitle(`${item.emoji} ${item.name}`)
        .setDescription(item.description)
        .addFields({ name: 'السعر', value: `**${item.price.toLocaleString()}** ${EMOJI_MORA}`, inline: true })
        .setColor(isPotion ? Colors.Purple : Colors.Greyple)
        .setImage(BANNER_URL)
        .setThumbnail(THUMBNAILS.get(item.id) || item.image || null)
        .setFooter({ text: `العنصر ${itemIndex + 1} / ${totalItems}` });

    const prevButton = new ButtonBuilder().setCustomId(`shop_paginate_item_${prevItemId}`).setEmoji('<:left:1439164494759723029>').setStyle(ButtonStyle.Secondary);
    const buyButton = new ButtonBuilder().setCustomId(`buy_item_${item.id}`).setLabel('شراء').setStyle(ButtonStyle.Success).setEmoji('<:mora:1435647151349698621>');
    const nextButton = new ButtonBuilder().setCustomId(`shop_paginate_item_${nextItemId}`).setEmoji('<:right:1439164491072929915>').setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(prevButton, buyButton, nextButton);
    return { embeds: [detailEmbed], components: [row] };
}

// ... (buildSkillEmbedWithPagination ودوال الصيد كما هي) ...
function buildSkillEmbedWithPagination(allUserSkills, pageIndex, sql, i) {
    pageIndex = parseInt(pageIndex) || 0;
    const totalSkills = allUserSkills.length;
    if (totalSkills === 0) return { content: '❌ لا توجد مهارات متاحة.', embeds: [], components: [] };
    if (pageIndex < 0) pageIndex = totalSkills - 1;
    if (pageIndex >= totalSkills) pageIndex = 0;
    const skillConfig = allUserSkills[pageIndex];
    if (!skillConfig) return { content: '❌ خطأ في البيانات.', embeds: [], components: [] };
    const prevIndex = (pageIndex - 1 + totalSkills) % totalSkills;
    const nextIndex = (pageIndex + 1) % totalSkills;
    let userSkill = sql.prepare("SELECT * FROM user_skills WHERE userID = ? AND guildID = ? AND skillID = ?").get(i.user.id, i.guild.id, skillConfig.id);
    let currentLevel = userSkill ? userSkill.skillLevel : 0;
    const isRaceSkill = skillConfig.id.startsWith('race_');
    const embedTitle = `${skillConfig.emoji} ${skillConfig.name} ${isRaceSkill ? '(مهارة عرق)' : ''}`;
    const embed = new EmbedBuilder().setTitle(embedTitle).setDescription(skillConfig.description).setColor(isRaceSkill ? Colors.Gold : Colors.Blue).setImage(BANNER_URL).setThumbnail(THUMBNAILS.get('upgrade_skill')).setFooter({ text: `المهارة ${pageIndex + 1} / ${totalSkills}` });
    const navigationRow = new ActionRowBuilder();
    const buttonRow = new ActionRowBuilder();
    navigationRow.addComponents(new ButtonBuilder().setCustomId(`shop_skill_paginate_${prevIndex}`).setEmoji('⬅️').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(`shop_skill_paginate_${nextIndex}`).setEmoji('➡️').setStyle(ButtonStyle.Secondary));
    _buildSkillEmbedFields(embed, buttonRow, skillConfig, currentLevel);
    const components = [buttonRow, navigationRow].filter(r => r.components.length > 0);
    return { embeds: [embed], components: components };
}

function _buildSkillEmbedFields(embed, buttonRow, skillConfig, currentLevel) {
    let currentEffect, nextEffect, nextLevelPrice, buttonId, buttonLabel;
    const effectType = skillConfig.stat_type.includes('%') ? '%' : (skillConfig.stat_type === 'TrueDMG' || skillConfig.stat_type === 'RecoilDMG' ? ' DMG' : '');
    if (currentLevel === 0) { currentEffect = 0; } 
    else if (skillConfig.max_level === 1) { currentEffect = skillConfig.base_value; } 
    else { currentEffect = skillConfig.base_value + (skillConfig.value_increment * (currentLevel - 1)); }
    embed.addFields({ name: "المستوى الحالي", value: `Lv. ${currentLevel}`, inline: true }, { name: "التأثير الحالي", value: `${currentEffect}${effectType}`, inline: true });
    if (currentLevel >= skillConfig.max_level) {
        embed.addFields({ name: "التطوير القادم", value: "وصلت للحد الأقصى!", inline: true });
        buttonRow.addComponents(new ButtonBuilder().setCustomId('max_level').setLabel('الحد الأقصى').setStyle(ButtonStyle.Success).setDisabled(true));
    } else {
        if (currentLevel === 0) { nextLevelPrice = skillConfig.base_price; buttonLabel = `شراء (Lv.1)`; buttonId = `buy_skill_${skillConfig.id}`; } 
        else { nextLevelPrice = skillConfig.base_price + (skillConfig.price_increment * currentLevel); buttonLabel = `تطوير (Lv.${currentLevel + 1})`; buttonId = `upgrade_skill_${skillConfig.id}`; }
        if (skillConfig.max_level === 1) { nextEffect = skillConfig.base_value; } else { nextEffect = skillConfig.base_value + (skillConfig.value_increment * currentLevel); }
        embed.addFields({ name: "المستوى القادم", value: `Lv. ${currentLevel + 1}`, inline: true }, { name: "التأثير القادم", value: `${nextEffect}${effectType}`, inline: true }, { name: "التكلفة", value: `${nextLevelPrice.toLocaleString()} ${EMOJI_MORA}`, inline: true });
        buttonRow.addComponents(new ButtonBuilder().setCustomId(buttonId).setLabel(buttonLabel).setStyle(ButtonStyle.Success).setEmoji('⬆️'));
    }
}

async function _handleRodSelect(i, client, sql) {
    if(i.replied || i.deferred) await i.editReply("جاري التحميل..."); else await i.deferReply({ flags: MessageFlags.Ephemeral });
    let userData = sql.prepare("SELECT rodLevel FROM levels WHERE user = ? AND guild = ?").get(i.user.id, i.guild.id);
    const currentLevel = userData ? (userData.rodLevel || 1) : 1;
    const nextLevel = currentLevel + 1;
    const currentRod = rodsConfig.find(r => r.level === currentLevel) || rodsConfig[0];
    const nextRod = rodsConfig.find(r => r.level === nextLevel);
    const embed = new EmbedBuilder().setTitle(`🎣 سنارة الصيد`).setDescription(`**السنارة الحالية:** ${currentRod.name}`).setColor(Colors.Aqua).setImage(BANNER_URL).setThumbnail(THUMBNAILS.get('upgrade_rod'))
        .addFields({ name: 'المستوى الحالي', value: `Lv. ${currentLevel}`, inline: true }, { name: 'أقصى صيد', value: `${currentRod.max_fish} سمكات`, inline: true }, { name: 'الحظ', value: `+${currentRod.luck_bonus}%`, inline: true });
    const row = new ActionRowBuilder();
    if (!nextRod) {
        embed.addFields({ name: "التطوير القادم", value: "الحد الأقصى", inline: true });
        row.addComponents(new ButtonBuilder().setCustomId('max_rod').setLabel('MAX').setStyle(ButtonStyle.Secondary).setDisabled(true));
    } else {
        embed.addFields({ name: "التالي", value: nextRod.name, inline: true }, { name: "السعر", value: `${nextRod.price.toLocaleString()}`, inline: true });
        row.addComponents(new ButtonBuilder().setCustomId('upgrade_rod').setLabel('تطوير').setStyle(ButtonStyle.Success).setEmoji('⬆️'));
    }
    await i.editReply({ embeds: [embed], components: [row] });
}

async function _handleBoatSelect(i, client, sql) {
    if(i.replied || i.deferred) await i.editReply("جاري التحميل..."); else await i.deferReply({ flags: MessageFlags.Ephemeral });
    let userData = sql.prepare("SELECT boatLevel FROM levels WHERE user = ? AND guild = ?").get(i.user.id, i.guild.id);
    const currentLevel = userData ? (userData.boatLevel || 1) : 1;
    const nextLevel = currentLevel + 1;
    const currentBoat = boatsConfig.find(b => b.level === currentLevel) || boatsConfig[0];
    const nextBoat = boatsConfig.find(b => b.level === nextLevel);
    const embed = new EmbedBuilder().setTitle(`🚤 قـوارب الـصـيـد`).setDescription(`**القارب الحالي:** ${currentBoat.name}`).setColor(Colors.Blue).setImage(BANNER_URL);
    const row = new ActionRowBuilder();
    if (!nextBoat) {
        embed.addFields({ name: "التطوير", value: "الحد الأقصى", inline: true });
        row.addComponents(new ButtonBuilder().setCustomId('max_boat').setLabel('MAX').setStyle(ButtonStyle.Secondary).setDisabled(true));
    } else {
        embed.addFields({ name: "القادم", value: nextBoat.name, inline: true }, { name: "السعر", value: `${nextBoat.price.toLocaleString()}`, inline: true }, { name: "يفتح", value: nextBoat.location_id, inline: false });
        row.addComponents(new ButtonBuilder().setCustomId('upgrade_boat').setLabel('شراء').setStyle(ButtonStyle.Success).setEmoji('🚤'));
    }
    await i.editReply({ embeds: [embed], components: [row] });
}

async function _handleBaitSelect(i, client, sql) {
    if(i.replied || i.deferred) await i.editReply("جاري التحميل..."); else await i.deferReply({ flags: MessageFlags.Ephemeral });
    const baitOptions = baitsConfig.map(b => {
        const unitPrice = Math.round(b.price / 5); 
        return { label: b.name, description: `${b.description} | ${unitPrice.toLocaleString()} مورا`, value: `buy_bait_${b.id}`, emoji: '🪱' };
    });
    const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('shop_buy_bait_menu').setPlaceholder('اختر الطعم (حبة واحدة)...').addOptions(baitOptions));
    await i.editReply({ content: "**🛒 متجر الطعوم:**", components: [row], embeds: [] });
}

async function _handlePotionSelect(i, client, sql) {
    if(i.replied || i.deferred) await i.editReply("جاري التحميل..."); else await i.deferReply({ flags: MessageFlags.Ephemeral });
    
    const potions = getPotionItems();
    if (potions.length === 0) return i.editReply({ content: "❌ لا توجد جرعات متاحة حالياً." });

    const limitedPotions = potions.slice(0, 25);
    const potionOptions = limitedPotions.map(p => {
        return { 
            label: p.name, 
            description: `${p.price.toLocaleString()} مورا | ${p.description.substring(0, 50)}`, 
            value: `buy_item_${p.id}`, 
            emoji: p.emoji 
        };
    });

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('shop_buy_potion_menu')
            .setPlaceholder('اختر الجرعة لشرائها...')
            .addOptions(potionOptions)
    );

    const embed = new EmbedBuilder()
        .setTitle('🧪 متجر الجرعات السحرية')
        .setDescription('اختر الجرعة التي تريد شراءها من القائمة بالأسفل.\n⚠️ **تنبيه:** عدد الجرعات التي يمكنك حملها يعتمد على مستواك!')
        .setColor(Colors.Purple)
        .setImage(BANNER_URL)
        .setThumbnail(THUMBNAILS.get('potions_menu'));

    await i.editReply({ embeds: [embed], components: [row] });
}

// ... (دوال التطوير والشراء - Rod, Boat, Bait - كما هي) ...
async function _handleRodUpgrade(i, client, sql) {
    await i.deferUpdate();
    const userId = i.user.id; let userData = client.getLevel.get(userId, i.guild.id);
    const nextLevel = (userData.rodLevel || 1) + 1; const nextRod = rodsConfig.find(r => r.level === nextLevel);
    if (!nextRod) return i.followUp({ content: '❌ الحد الأقصى.', flags: MessageFlags.Ephemeral });
    if (userData.mora < nextRod.price) {
        const userBank = userData.bank || 0;
        let msg = `❌ رصيدك غير كافي.`;
        if (userBank >= nextRod.price) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}** مورا، اسحب منها.`;
        return i.followUp({ content: msg, flags: MessageFlags.Ephemeral });
    }
    userData.mora -= nextRod.price; userData.rodLevel = nextLevel; client.setLevel.run(userData);
    await i.followUp({ content: `🎉 مبروك! تم شراء **${nextRod.name}**!`, flags: MessageFlags.Ephemeral });
    sendShopLog(client, i.guild.id, i.member, `سنارة صيد: ${nextRod.name}`, nextRod.price, "شراء/تطوير");
    await _handleRodSelect(i, client, sql);
}

async function _handleBoatUpgrade(i, client, sql) {
    await i.deferUpdate();
    const userId = i.user.id; let userData = client.getLevel.get(userId, i.guild.id);
    const nextLevel = (userData.boatLevel || 1) + 1; const nextBoat = boatsConfig.find(b => b.level === nextLevel);
    if (!nextBoat) return i.followUp({ content: '❌ الحد الأقصى.', flags: MessageFlags.Ephemeral });
    if (userData.mora < nextBoat.price) {
        const userBank = userData.bank || 0;
        let msg = `❌ رصيدك غير كافي.`;
        if (userBank >= nextBoat.price) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}** مورا، اسحب منها.`;
        return i.followUp({ content: msg, flags: MessageFlags.Ephemeral });
    }
    userData.mora -= nextBoat.price; userData.boatLevel = nextLevel;
    sql.prepare("UPDATE levels SET boatLevel = ?, mora = ?, currentLocation = ? WHERE user = ? AND guild = ?").run(nextLevel, userData.mora, nextBoat.location_id, userId, i.guild.id);
    await i.followUp({ content: `🎉 مبروك! تم شراء **${nextBoat.name}**!`, flags: MessageFlags.Ephemeral });
    sendShopLog(client, i.guild.id, i.member, `قارب صيد: ${nextBoat.name}`, nextBoat.price, "شراء/تطوير");
    await _handleBoatSelect(i, client, sql);
}

async function _handleBaitBuy(i, client, sql) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const baitId = i.values[0].replace('buy_bait_', '');
    const bait = baitsConfig.find(b => b.id === baitId);
    const qty = 1; 
    const unitPrice = Math.round(bait.price / 5);
    const cost = unitPrice * qty;
    let userData = client.getLevel.get(i.user.id, i.guild.id);
    if (userData.mora < cost) {
        const userBank = userData.bank || 0;
        let msg = `❌ رصيدك غير كافي.`;
        if (userBank >= cost) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}** مورا، اسحب منها.`;
        return i.editReply(msg);
    }
    userData.mora -= cost; 
    client.setLevel.run(userData);
    sql.prepare("INSERT INTO user_portfolio (guildID, userID, itemID, quantity) VALUES (?, ?, ?, ?) ON CONFLICT(guildID, userID, itemID) DO UPDATE SET quantity = quantity + ?").run(i.guild.id, i.user.id, baitId, qty, qty);
    await i.editReply({ content: `✅ تم شراء **${qty}x ${bait.name}** بنجاح!` });
    sendShopLog(client, i.guild.id, i.member, `طعم: ${bait.name} (x${qty})`, cost, "شراء");
}

async function _handleWeaponUpgrade(i, client, sql) {
    try {
        const userId = i.user.id; const guildId = i.guild.id; const isBuy = i.customId.startsWith('buy_weapon_');
        let exactRaceName = null; let weaponConfig = null;
        if (i.isStringSelectMenu() && i.values[0] === 'upgrade_weapon') {
             if (!i.replied && !i.deferred) await i.deferReply({ flags: MessageFlags.Ephemeral });
             const userRace = getUserRace(i.member, sql);
             if (!userRace) return i.editReply({ content: "❌ ليس لديك عرق! قم باختيار عرقك أولاً." });
             weaponConfig = weaponsConfig.find(w => w.race.toLowerCase() === userRace.raceName.toLowerCase());
             if (!weaponConfig) return i.editReply({ content: `❌ لا يوجد سلاح متاح لعرقك (${userRace.raceName}).` });
             exactRaceName = weaponConfig.race;
        }
        else if (i.isButton()) {
             if (!i.replied && !i.deferred) await i.deferUpdate(); 
             const raceNameFromBtn = i.customId.replace(isBuy ? 'buy_weapon_' : 'upgrade_weapon_', ''); 
             weaponConfig = weaponsConfig.find(w => w.race.toLowerCase() === raceNameFromBtn.toLowerCase());
             if (!weaponConfig) {
                 const userRace = getUserRace(i.member, sql);
                 if (userRace) weaponConfig = weaponsConfig.find(w => w.race.toLowerCase() === userRace.raceName.toLowerCase());
             }
             if (!weaponConfig) return await i.followUp({ content: `❌ خطأ: لم يتم العثور على بيانات سلاح للعرق: ${raceNameFromBtn}`, flags: MessageFlags.Ephemeral });
             exactRaceName = weaponConfig.race;
        }
        let userData = client.getLevel.get(userId, guildId); if (!userData) userData = { ...client.defaultData, user: userId, guild: guildId };
        let userWeapon = sql.prepare("SELECT * FROM user_weapons WHERE userID = ? AND guildID = ? AND raceName = ?").get(userId, guildId, exactRaceName);
        let currentLevel = userWeapon ? userWeapon.weaponLevel : 0;
        if (i.isButton()) {
            if (currentLevel >= weaponConfig.max_level) return await i.followUp({ content: '❌ لقد وصلت للحد الأقصى للتطوير بالفعل!', flags: MessageFlags.Ephemeral });
            let price = (currentLevel === 0) ? weaponConfig.base_price : weaponConfig.base_price + (weaponConfig.price_increment * currentLevel);
            const itemData = { raceName: exactRaceName, newLevel: currentLevel + 1, isBuy: isBuy, dbId: userWeapon ? userWeapon.id : null, name: weaponConfig.name, currentLevel: currentLevel };
            await handlePurchaseWithCoupons(i, itemData, 1, price, client, sql, 'weapon');
            return; 
        }
        const calculatedDamage = (currentLevel === 0) ? 0 : weaponConfig.base_damage + (weaponConfig.damage_increment * (currentLevel - 1));
        const embed = new EmbedBuilder().setTitle(`${weaponConfig.emoji} سلاح العرق: ${weaponConfig.name}`).setColor(Colors.Blue).setImage(BANNER_URL).setThumbnail(THUMBNAILS.get('upgrade_weapon')).addFields({ name: "العرق", value: exactRaceName, inline: true }, { name: "المستوى", value: `Lv. ${currentLevel}`, inline: true }, { name: "الضرر", value: `${calculatedDamage} DMG`, inline: true });
        const row = new ActionRowBuilder();
        if (currentLevel >= weaponConfig.max_level) { 
            embed.addFields({ name: "التطوير", value: "وصلت للحد الأقصى!", inline: true }); 
            row.addComponents(new ButtonBuilder().setCustomId('max_level').setLabel('الحد الأقصى').setStyle(ButtonStyle.Success).setDisabled(true)); 
        } else { 
            const nextLevelPrice = (currentLevel === 0) ? weaponConfig.base_price : weaponConfig.base_price + (weaponConfig.price_increment * currentLevel); 
            const nextDamage = (currentLevel === 0) ? weaponConfig.base_damage : calculatedDamage + weaponConfig.damage_increment; 
            const buttonId = currentLevel === 0 ? `buy_weapon_${exactRaceName}` : `upgrade_weapon_${exactRaceName}`; 
            const buttonLabel = currentLevel === 0 ? `شراء (Lv.1)` : `تطوير (Lv.${currentLevel + 1})`; 
            embed.addFields({ name: "المستوى القادم", value: `Lv. ${currentLevel + 1}`, inline: true }, { name: "التأثير القادم", value: `${nextDamage} DMG`, inline: true }, { name: "تكلفة التطوير", value: `${nextLevelPrice.toLocaleString()} ${EMOJI_MORA}`, inline: true }); 
            row.addComponents(new ButtonBuilder().setCustomId(buttonId).setLabel(buttonLabel).setStyle(ButtonStyle.Success).setEmoji('⬆️')); 
        }
        await i.editReply({ embeds: [embed], components: [row] });
    } catch (error) { console.error("خطأ في زر تطوير السلاح:", error); if (i.replied || i.deferred) await i.followUp({ content: '❌ حدث خطأ.', flags: MessageFlags.Ephemeral }); }
}

async function _handleSkillUpgrade(i, client, sql) {
    try {
        await i.deferUpdate();
        const userId = i.user.id; const guildId = i.guild.id; const isBuy = i.customId.startsWith('buy_skill_');
        const skillId = i.customId.replace(isBuy ? 'buy_skill_' : 'upgrade_skill_', ''); const skillConfig = skillsConfig.find(s => s.id === skillId);
        if (!skillConfig) return await i.followUp({ content: '❌ خطأ: لم يتم العثور على بيانات هذه المهارة.', flags: MessageFlags.Ephemeral });
        let userData = client.getLevel.get(userId, guildId); if (!userData) userData = { ...client.defaultData, user: userId, guild: guildId };
        let userSkill = sql.prepare("SELECT * FROM user_skills WHERE userID = ? AND guildID = ? AND skillID = ?").get(userId, guildId, skillId);
        let currentLevel = userSkill ? userSkill.skillLevel : 0; let price = 0;
        if (currentLevel >= skillConfig.max_level) return await i.followUp({ content: '❌ لقد وصلت للحد الأقصى للتطوير بالفعل!', flags: MessageFlags.Ephemeral });
        price = (currentLevel === 0) ? skillConfig.base_price : skillConfig.base_price + (skillConfig.price_increment * currentLevel);
        const itemData = { skillId: skillId, newLevel: currentLevel + 1, isBuy: isBuy, dbId: userSkill ? userSkill.id : null, name: skillConfig.name, currentLevel: currentLevel };
        await handlePurchaseWithCoupons(i, itemData, 1, price, client, sql, 'skill');
    } catch (error) { console.error("خطأ في زر تطوير المهارة:", error); if (i.replied || i.deferred) await i.followUp({ content: '❌ حدث خطأ.', flags: MessageFlags.Ephemeral }); }
}

async function _handleShopButton(i, client, sql) {
    try {
        const userId = i.user.id; const guildId = i.guild.id; const boughtItemId = i.customId.replace('buy_item_', ''); 
        
        if (boughtItemId === 'item_temp_reply') {
            const userMora = sql.prepare("SELECT mora FROM levels WHERE user = ? AND guild = ?").get(userId, guildId)?.mora || 0;
            if (userMora < 10000) return i.reply({ content: `❌ تحتاج 10,000 ${EMOJI_MORA}`, flags: [MessageFlags.Ephemeral] });
            const modal = new ModalBuilder().setCustomId('shop_buy_reply_modal').setTitle('شراء رد تلقائي (3 أيام)');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reply_trigger').setLabel("الكلمة (Trigger)").setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reply_response').setLabel("الرد (Response)").setStyle(TextInputStyle.Paragraph).setRequired(true))
            );
            return i.showModal(modal);
        }

        // 🔥 البحث في كلا الملفين 🔥
        let item = shopItems.find(it => it.id === boughtItemId);
        if (!item) item = potionItems.find(it => it.id === boughtItemId);

        if (!item) return await i.reply({ content: '❌ هذا العنصر غير موجود!', flags: MessageFlags.Ephemeral });
        let userData = client.getLevel.get(userId, guildId); if (!userData) userData = { ...client.defaultData, user: userId, guild: guildId };
        
        // 🔥🔥🔥 التحقق من حدود الجرعات (باستخدام الجدول الجديد) 🔥🔥🔥
        if (item.category === 'potions') {
            ensureInventoryTable(sql); // إنشاء الجدول إذا لم يكن موجوداً
            
            const userLevel = userData.level;
            let maxTypes = 3;
            let maxQtyPerType = 1;
            if (userLevel >= 31) { maxTypes = 6; maxQtyPerType = 5; }
            else if (userLevel >= 21) { maxTypes = 6; maxQtyPerType = 3; }
            else if (userLevel >= 11) { maxTypes = 6; maxQtyPerType = 2; }
            else { maxTypes = 3; maxQtyPerType = 1; }

            // القراءة من user_inventory
            const existingPotion = sql.prepare("SELECT quantity FROM user_inventory WHERE userID = ? AND guildID = ? AND itemID = ?").get(userId, guildId, item.id);
            // 🔥 الإصلاح: نعتبر الكمية 0 إذا لم يكن هناك سجل أو الكمية 0
            const currentQty = (existingPotion && existingPotion.quantity > 0) ? existingPotion.quantity : 0;

            if (currentQty >= maxQtyPerType) {
                return await i.reply({ content: `🚫 **وصلت للحد الأقصى من هذه الجرعة!**\nمستواك الحالي (${userLevel}) يسمح لك بحمل **${maxQtyPerType}** فقط من نوع **${item.name}**.\nارفع مستواك لزيادة السعة!`, flags: MessageFlags.Ephemeral });
            }
            if (currentQty === 0) {
                // القراءة من user_inventory
                // 🔥 الإصلاح: حساب فقط الأنواع التي كميتها > 0
                const allUserItems = sql.prepare("SELECT itemID, quantity FROM user_inventory WHERE userID = ? AND guildID = ?").all(userId, guildId);
                let currentPotionTypesCount = 0;
                for (const uItem of allUserItems) {
                    if (uItem.quantity <= 0) continue; // تجاهل الكميات الصفرية
                    const shopItem = potionItems.find(si => si.id === uItem.itemID); 
                    if (shopItem) { currentPotionTypesCount++; }
                }
                
                if (currentPotionTypesCount >= maxTypes) {
                    return await i.reply({ content: `🚫 **حقيبتك ممتلئة بأنواع مختلفة!**\nمستواك الحالي (${userLevel}) يسمح لك بحمل **${maxTypes}** أنواع مختلفة من الجرعات.\nاستهلك بعض الجرعات أولاً.`, flags: MessageFlags.Ephemeral });
                }
            }
        }
        // 🔥🔥🔥 نهاية التحقق 🔥🔥🔥

        const RESTRICTED_ITEMS = ['nitro_basic', 'nitro_gaming', 'discord_effect_5', 'discord_effect_10'];
        if (RESTRICTED_ITEMS.includes(item.id)) {
             if (userData.level < 30) return await i.reply({ content: `❌ يجب أن يكون مستواك 30+ لشراء هذا العنصر!`, flags: MessageFlags.Ephemeral });
             const userLoan = sql.prepare("SELECT 1 FROM user_loans WHERE userID = ? AND guildID = ? AND remainingAmount > 0").get(userId, guildId);
             if (userLoan) return await i.reply({ content: `عـليـك قـرض قـم بـسداده اولا`, flags: MessageFlags.Ephemeral });
        }

        const NON_DISCOUNTABLE = [...RESTRICTED_ITEMS, 'xp_buff_1d_3', 'xp_buff_1d_7', 'xp_buff_2d_10'];
        if (NON_DISCOUNTABLE.includes(item.id) || item.id.startsWith('xp_buff_')) {
             await i.deferReply({ flags: MessageFlags.Ephemeral });
             if (userData.mora < item.price) {
                 const userBank = userData.bank || 0;
                 let msg = `❌ رصيدك غير كافي!`;
                 if (userBank >= item.price) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}** مورا، اسحب منها.`;
                 return await i.editReply({ content: msg });
             }
             if (item.id.startsWith('xp_buff_')) {
                const getActiveBuff = sql.prepare("SELECT * FROM user_buffs WHERE userID = ? AND guildID = ? AND buffType = 'xp' AND expiresAt > ?");
                const activeBuff = getActiveBuff.get(userId, guildId, Date.now());
                if (activeBuff) {
                    const replaceButton = new ButtonBuilder().setCustomId(`replace_buff_${item.id}`).setLabel("إلغاء القديم وشراء الجديد").setStyle(ButtonStyle.Danger);
                    const cancelButton = new ButtonBuilder().setCustomId('cancel_purchase').setLabel("إلغة").setStyle(ButtonStyle.Secondary);
                    const row = new ActionRowBuilder().addComponents(replaceButton, cancelButton);
                    return await i.editReply({ content: `⚠️ لديك معزز خبرة فعال بالفعل!`, components: [row], embeds: [] });
                }
             }
             if (RESTRICTED_ITEMS.includes(item.id)) {
                 if (userData.mora < item.price) return await i.editReply({ content: `❌ رصيدك غير كافي!` });
                 userData.mora -= item.price;
                 const owner = await client.users.fetch(OWNER_ID);
                 if (owner) { owner.send(`🔔 تنبيه شراء!\n\nالعضو: ${i.user.tag} (${i.user.id})\nاشترى: **${item.name}**\nالمبلغ: ${item.price.toLocaleString()} ${EMOJI_MORA}`).catch(console.error); }
                 userData.shop_purchases = (userData.shop_purchases || 0) + 1;
                 client.setLevel.run(userData);
                 await i.editReply({ content: `✅ تمت عملية الشراء! فضلاً، قم بفتح "مجلس خاص" (تكت) لاستلام طلبك.` });
                 sendShopLog(client, guildId, i.member, item.name, item.price, "شراء");
                 return;
             }
             await processFinalPurchase(i, item, 1, item.price, 0, 'none', client, sql, 'item');
             return;
        }
        await handlePurchaseWithCoupons(i, item, 1, item.price, client, sql, 'item');

    } catch (error) { console.error("خطأ في زر المتجر:", error); if (i.replied || i.deferred) await i.followUp({ content: '❌ حدث خطأ.', flags: MessageFlags.Ephemeral }); else await i.reply({ content: '❌ حدث خطأ.', flags: MessageFlags.Ephemeral }); }
}

async function _handleReplaceGuard(i, client, sql) {
    try {
        await i.deferUpdate();
        const userId = i.user.id; const guildId = i.guild.id; const item = shopItems.find(it => it.id === 'personal_guard_1d');
        let userData = client.getLevel.get(userId, guildId); if (!userData) userData = { ...client.defaultData, user: userId, guild: guildId };
        if (userData.mora < item.price) {
            const userBank = userData.bank || 0;
            let msg = `❌ رصيدك غير كافي! تحتاج إلى **${item.price.toLocaleString()}** ${EMOJI_MORA}`;
            if (userBank >= item.price) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}** مورا.`;
            return await i.followUp({ content: msg, components: [], embeds: [], ephemeral: true });
        }
        userData.mora -= item.price; userData.hasGuard = 3; userData.guardExpires = 0; userData.shop_purchases = (userData.shop_purchases || 0) + 1;
        client.setLevel.run(userData);
        await i.followUp({ content: `✅ **تم تجديد العقد!**\nلديك الآن **3** محاولات حماية جديدة.\nرصيدك المتبقي: **${userData.mora.toLocaleString()}** ${EMOJI_MORA}`, components: [], embeds: [], ephemeral: true });
        sendShopLog(client, guildId, i.member, "حارس شخصي (تجديد)", item.price, "شراء");
    } catch (error) { console.error("Guard Replace Error:", error); }
}

async function _handleReplaceBuffButton(i, client, sql) {
    try {
        await i.deferUpdate();
        const userId = i.user.id; const guildId = i.guild.id; const newItemId = i.customId.replace('replace_buff_', '');
        const item = shopItems.find(it => it.id === newItemId);
        if (!item) return await i.followUp({ content: '❌ هذا العنصر غير موجود!', components: [], embeds: [], ephemeral: true });
        let userData = client.getLevel.get(userId, guildId); if (!userData) userData = { ...client.defaultData, user: userId, guild: guildId };
        if (userData.mora < item.price) {
            const userBank = userData.bank || 0;
            let msg = `❌ رصيدك غير كافي! تحتاج إلى **${item.price.toLocaleString()}** ${EMOJI_MORA}`;
            if (userBank >= item.price) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}** مورا.`;
            return await i.followUp({ content: msg, components: [], embeds: [], ephemeral: true });
        }
        userData.mora -= item.price;
        sql.prepare("DELETE FROM user_buffs WHERE userID = ? AND guildID = ? AND buffType = 'xp'").run(userId, guildId);
        let expiresAt, multiplier, buffPercent;
        switch (item.id) {
            case 'xp_buff_1d_3': multiplier = 0.45; buffPercent = 45; expiresAt = Date.now() + (24 * 60 * 60 * 1000); break;
            case 'xp_buff_1d_7': multiplier = 0.70; buffPercent = 70; expiresAt = Date.now() + (48 * 60 * 60 * 1000); break;
            case 'xp_buff_2d_10': multiplier = 0.90; buffPercent = 90; expiresAt = Date.now() + (72 * 60 * 60 * 1000); break;
        }
        sql.prepare("INSERT INTO user_buffs (userID, guildID, buffType, multiplier, expiresAt, buffPercent) VALUES (?, ?, ?, ?, ?, ?)").run(userId, guildId, 'xp', multiplier, expiresAt, buffPercent);
        userData.shop_purchases = (userData.shop_purchases || 0) + 1;
        client.setLevel.run(userData);
        await i.followUp({ content: `✅ تم استبدال المعزز وشراء **${item.name}** بنجاح!\nرصيدك المتبقي: **${userData.mora.toLocaleString()}** ${EMOJI_MORA}`, components: [], embeds: [], ephemeral: true });
        sendShopLog(client, guildId, i.member, item.name, item.price, "استبدال/شراء");
    } catch (error) { console.error("خطأ في زر استبدال المعزز:", error); if (i.replied || i.deferred) await i.followUp({ content: '❌ حدث خطأ.', flags: MessageFlags.Ephemeral }); }
}

async function handleShopModal(i, client, sql) {
    if (i.customId === 'exchange_xp_modal') { await _handleXpExchangeModal(i, client, sql); return true; }
    if (i.customId === 'shop_buy_reply_modal') {
        const trigger = i.fields.getTextInputValue('reply_trigger').trim();
        const response = i.fields.getTextInputValue('reply_response').trim();
        const price = 10000;
        await i.deferReply({ flags: MessageFlags.Ephemeral });
        const userData = sql.prepare("SELECT mora FROM levels WHERE user = ? AND guild = ?").get(i.user.id, i.guild.id);
        if (!userData || userData.mora < price) return i.editReply(`❌ رصيدك غير كافي.`);
        const existing = sql.prepare("SELECT 1 FROM auto_responses WHERE guildID = ? AND trigger = ?").get(i.guild.id, trigger);
        if (existing) return i.editReply(`❌ هذا الرد موجود مسبقاً.`);
        try {
            sql.prepare("UPDATE levels SET mora = mora - ? WHERE user = ? AND guild = ?").run(price, i.user.id, i.guild.id);
            const expiresAt = Date.now() + (3 * 24 * 60 * 60 * 1000);
            sql.prepare("INSERT INTO auto_responses (guildID, trigger, response, matchType, cooldown, createdBy, expiresAt) VALUES (?, ?, ?, 'exact', 600, ?, ?)").run(i.guild.id, trigger, response, i.user.id, expiresAt);
            await i.editReply(`✅ **تم شراء الرد!**\n- الكلمة: \`${trigger}\`\n- الرد: \`${response}\`\n- الصلاحية: 3 أيام`);
            sendShopLog(client, i.guild.id, i.member, `رد تلقائي: ${trigger}`, price, "شراء");
        } catch (e) { console.error(e); await i.editReply(`❌ حدث خطأ.`); }
        return true;
    }
    const isBuyMarket = i.customId.startsWith('buy_modal_');
    const isSellMarket = i.customId.startsWith('sell_modal_');
    const isBuyFarm = i.customId.startsWith('buy_animal_');
    const isSellFarm = i.customId.startsWith('sell_animal_');
    if (isBuyMarket || isSellMarket || isBuyFarm || isSellFarm) {
        await _handleBuySellModal(i, client, sql, { isBuyMarket, isSellMarket, isBuyFarm, isSellFarm });
        return true;
    }
    return false;
}

// 🔥🔥🔥 الدالة المعدلة لإصلاح المزرعة والسوق 🔥🔥🔥
async function _handleBuySellModal(i, client, sql, types) {
    const { isBuyMarket, isSellMarket, isBuyFarm, isSellFarm } = types;
    await i.deferReply({ ephemeral: false }); // لأن هذه العمليات ليست ephemeral عادة
    try {
        const quantityString = i.fields.getTextInputValue('quantity_input');
        const quantity = parseInt(quantityString.trim().replace(/,/g, ''));
        if (isNaN(quantity) || quantity <= 0 || !Number.isInteger(quantity)) return await i.editReply({ content: '❌ كمية غير صالحة.' });
        
        let userData = client.getLevel.get(i.user.id, i.guild.id); if (!userData) userData = { ...client.defaultData, user: i.user.id, guild: i.guild.id };
        let userMora = userData.mora || 0; const userBank = userData.bank || 0;
        
        // --- قسم المزرعة ---
        if (isBuyFarm || isSellFarm) {
             const animalId = i.customId.replace(isBuyFarm ? 'buy_animal_' : 'sell_animal_', '');
             const animal = farmAnimals.find(a => a.id === animalId);
             if (!animal) return await i.editReply({ content: '❌ حيوان غير موجود.' });
             
             if(isBuyFarm) {
                 const totalCost = Math.floor(animal.price * quantity);
                 if (userMora < totalCost) {
                     let msg = `❌ رصيدك غير كافي! تحتاج: **${totalCost.toLocaleString()}** ${EMOJI_MORA}`;
                     if (userBank >= totalCost) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}**، اسحب منها.`;
                     return await i.editReply({ content: msg });
                 }
                 userData.mora -= totalCost;
                 const now = Date.now();
                 // إضافة كل حيوان كسجل منفصل (لأن المزرعة تعتمد على وقت الحصاد الفردي)
                 for (let j = 0; j < quantity; j++) {
                     sql.prepare("INSERT INTO user_farm (guildID, userID, animalID, purchaseTimestamp, lastCollected) VALUES (?, ?, ?, ?, ?)").run(i.guild.id, i.user.id, animal.id, now, now);
                 }
                 userData.shop_purchases = (userData.shop_purchases || 0) + 1;
                 client.setLevel.run(userData);
                 const embed = new EmbedBuilder().setTitle('✅ تم الشراء').setColor(Colors.Green).setDescription(`📦 **${quantity}** × ${animal.name}\n💵 التكلفة: **${totalCost.toLocaleString()}** ${EMOJI_MORA}`).setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });
                 return await i.editReply({ embeds: [embed] });
             } else {
                 const farmCount = sql.prepare("SELECT COUNT(*) as count FROM user_farm WHERE userID = ? AND guildID = ? AND animalID = ?").get(i.user.id, i.guild.id, animal.id).count;
                 if (farmCount < quantity) return await i.editReply({ content: `❌ لا تملك هذه الكمية.` });
                 const toDelete = sql.prepare("SELECT id FROM user_farm WHERE userID = ? AND guildID = ? AND animalID = ? LIMIT ?").all(i.user.id, i.guild.id, animal.id, quantity);
                 toDelete.forEach(d => sql.prepare("DELETE FROM user_farm WHERE id = ?").run(d.id));
                 const totalGain = Math.floor(animal.price * 0.70 * quantity); // بيع بـ 70%
                 userData.mora += totalGain;
                 client.setLevel.run(userData);
                 const embed = new EmbedBuilder().setTitle('✅ تم البيع').setColor(Colors.Green).setDescription(`📦 **${quantity}** × ${animal.name}\n💵 الربح: **${totalGain.toLocaleString()}** ${EMOJI_MORA}`).setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });
                 return await i.editReply({ embeds: [embed] });
             }
        }
        
        // --- قسم السوق (Market) ---
        const assetId = i.customId.replace(isBuyMarket ? 'buy_modal_' : 'sell_modal_', '');
        const item = sql.prepare("SELECT * FROM market_items WHERE id = ?").get(assetId);
        if (!item) return await i.editReply({ content: '❌ الأصل غير موجود.' });
        
        const getPortfolio = sql.prepare("SELECT * FROM user_portfolio WHERE userID = ? AND guildID = ? AND itemID = ?");
        
        if (isBuyMarket) {
             const avgPrice = calculateSlippage(item.currentPrice, quantity, true);
             const totalCost = Math.floor(avgPrice * quantity);
             if (userMora < totalCost) {
                 let msg = `❌ رصيدك غير كافي!`;
                 if (userBank >= totalCost) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}**، اسحب منها.`;
                 if (totalCost > (item.currentPrice * quantity)) msg += `\n⚠️ السعر ارتفع بسبب الانزلاق السعري (الكمية الكبيرة). التكلفة الحالية: **${totalCost.toLocaleString()}**`;
                 return await i.editReply({ content: msg });
             }
             userData.mora -= totalCost; userData.shop_purchases = (userData.shop_purchases || 0) + 1;
             client.setLevel.run(userData);
             
             // تحديث المحفظة (Portfolio)
             let pfItem = getPortfolio.get(i.user.id, i.guild.id, item.id);
             if (pfItem) sql.prepare("UPDATE user_portfolio SET quantity = quantity + ? WHERE id = ?").run(quantity, pfItem.id);
             else sql.prepare("INSERT INTO user_portfolio (guildID, userID, itemID, quantity) VALUES (?, ?, ?, ?)").run(i.guild.id, i.user.id, item.id, quantity);
             
             const embed = new EmbedBuilder().setTitle('✅ تم الشراء').setColor(Colors.Green).setDescription(`📦 **${quantity}** × ${item.name}\n💵 التكلفة: **${totalCost.toLocaleString()}** ${EMOJI_MORA}`).setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });
             await i.editReply({ embeds: [embed] });
        } else {
             let pfItem = getPortfolio.get(i.user.id, i.guild.id, item.id);
             const userQty = pfItem ? pfItem.quantity : 0;
             if (userQty < quantity) return await i.editReply({ content: `❌ لا تملك الكمية.` });
             
             const avgPrice = calculateSlippage(item.currentPrice, quantity, false);
             const totalGain = Math.floor(avgPrice * quantity);
             userData.mora += totalGain;
             client.setLevel.run(userData);
             
             if (userQty - quantity > 0) sql.prepare("UPDATE user_portfolio SET quantity = ? WHERE id = ?").run(userQty - quantity, pfItem.id);
             else sql.prepare("DELETE FROM user_portfolio WHERE id = ?").run(pfItem.id);
             
             const embed = new EmbedBuilder().setTitle('✅ تم البيع').setColor(Colors.Green).setDescription(`📦 **${quantity}** × ${item.name}\n💵 الربح: **${totalGain.toLocaleString()}** ${EMOJI_MORA}`).setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });
             await i.editReply({ embeds: [embed] });
        }
    } catch (error) { console.error(error); await i.editReply("❌ حدث خطأ."); }
}

async function _handleXpExchangeModal(i, client, sql) {
    try {
        await i.deferReply({ flags: MessageFlags.Ephemeral });
        const userId = i.user.id; const guildId = i.guild.id;
        const userLoan = sql.prepare("SELECT 1 FROM user_loans WHERE userID = ? AND guildID = ? AND remainingAmount > 0").get(userId, guildId);
        if (userLoan) return await i.editReply({ content: `❌ عليك قرض.` });
        let userData = client.getLevel.get(userId, guildId); if (!userData) userData = { ...client.defaultData, user: userId, guild: guildId };
        const userMora = userData.mora || 0;
        const amountString = i.fields.getTextInputValue('xp_amount_input').trim().toLowerCase();
        let amountToBuy = 0;
        if (amountString === 'all') amountToBuy = Math.floor(userMora / XP_EXCHANGE_RATE);
        else amountToBuy = parseInt(amountString.replace(/,/g, ''));
        if (isNaN(amountToBuy) || amountToBuy <= 0) return await i.editReply({ content: '❌ رقم غير صالح.' });
        const totalCost = amountToBuy * XP_EXCHANGE_RATE;
        if (userMora < totalCost) {
            const userBank = userData.bank || 0;
            let msg = `❌ رصيدك غير كافي.`;
            if (userBank >= totalCost) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}** مورا.`;
            return await i.editReply({ content: msg });
        }
        userData.mora -= totalCost; userData.xp += amountToBuy; userData.totalXP += amountToBuy;
        let nextXP = 5 * (userData.level ** 2) + (50 * userData.level) + 100;
        let levelUpOccurred = false;
        while (userData.xp >= nextXP) {
             const oldLevel = userData.level; userData.level++; userData.xp -= nextXP;
             nextXP = 5 * (userData.level ** 2) + (50 * userData.level) + 100;
             levelUpOccurred = true;
             await sendLevelUpMessage(i, i.member, userData.level, oldLevel, userData, sql);
        }
        userData.shop_purchases = (userData.shop_purchases || 0) + 1;
        client.setLevel.run(userData);
        let msg = `✅ تم شراء **${amountToBuy} XP** بـ **${totalCost}** مورا.`;
        if (levelUpOccurred) msg += `\n🎉 مبروك المستوى الجديد ${userData.level}!`;
        await i.editReply({ content: msg });
        sendShopLog(client, guildId, i.member, `شراء ${amountToBuy} XP`, totalCost, "تبديل");
    } catch (e) { console.error(e); }
}

async function handleShopInteractions(i, client, sql) {
    // 🔥🔥 إصلاح التصفح: استخدم editReply لتعديل الرسالة بدلاً من update 🔥🔥
    if (i.customId.startsWith('shop_paginate_item_')) { 
        try { 
            await i.deferUpdate(); 
            const id = i.customId.replace('shop_paginate_item_', ''); 
            const embed = buildPaginatedItemEmbed(id); 
            if (embed) await i.editReply(embed); 
        } catch (e) {} return; 
    }
    if (i.customId.startsWith('shop_skill_paginate_')) { 
        try { 
            await i.deferUpdate(); 
            const idx = i.customId.replace('shop_skill_paginate_', ''); 
            const skills = getAllUserAvailableSkills(i.member, sql); 
            const embed = buildSkillEmbedWithPagination(skills, idx, sql, i); 
            if (embed) await i.editReply(embed); 
        } catch (e) {} return; 
    }

    if (i.isStringSelectMenu() && i.customId === 'fishing_gear_sub_menu') {
        const val = i.values[0];
        if (val === 'gear_rods') await _handleRodSelect(i, client, sql);
        else if (val === 'gear_boats') await _handleBoatSelect(i, client, sql);
        else if (val === 'gear_baits') await _handleBaitSelect(i, client, sql);
        return;
    }

    if (i.isStringSelectMenu() && i.customId === 'shop_buy_potion_menu') {
        const potionId = i.values[0].replace('buy_item_', '');
        const paginationEmbed = buildPaginatedItemEmbed(potionId);
        if (paginationEmbed) return await i.reply({ ...paginationEmbed, flags: MessageFlags.Ephemeral });
        else return await i.reply({ content: "❌ خطأ في تحميل بيانات الجرعة.", flags: MessageFlags.Ephemeral });
    }

    if (i.customId === 'upgrade_rod') await _handleRodUpgrade(i, client, sql);
    else if (i.customId === 'upgrade_boat') await _handleBoatUpgrade(i, client, sql);
    else if (i.isStringSelectMenu() && i.customId === 'shop_buy_bait_menu') await _handleBaitBuy(i, client, sql);
    else if (i.customId.startsWith('buy_item_')) await _handleShopButton(i, client, sql);
    else if (i.customId.startsWith('replace_buff_')) await _handleReplaceBuffButton(i, client, sql);
    else if (i.customId.startsWith('buy_weapon_') || i.customId.startsWith('upgrade_weapon_')) await _handleWeaponUpgrade(i, client, sql);
    else if (i.customId.startsWith('buy_skill_') || i.customId.startsWith('upgrade_skill_')) await _handleSkillUpgrade(i, client, sql);
    else if (i.customId === 'cancel_purchase') { await i.deferUpdate(); await i.editReply({ content: 'تم الإلغاء.', components: [], embeds: [] }); }
    else if (i.customId === 'open_xp_modal') { 
        const xpModal = new ModalBuilder().setCustomId('exchange_xp_modal').setTitle('شراء خبرة');
        xpModal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('xp_amount_input').setLabel('الكمية').setStyle(TextInputStyle.Short).setRequired(true)));
        await i.showModal(xpModal);
    }
    else if (i.customId === 'replace_guard') { await _handleReplaceGuard(i, client, sql); }
    
    // 🔥🔥 توجيه صحيح لمودالات السوق والمزرعة 🔥🔥
    else if (i.customId.startsWith('buy_market_') || i.customId.startsWith('sell_market_') || i.customId.startsWith('buy_animal_') || i.customId.startsWith('sell_animal_')) {
        const action = i.customId.split('_')[0]; 
        const modalId = action === 'buy' ? (i.customId.includes('market') ? 'buy_modal_' : 'buy_animal_') : (i.customId.includes('market') ? 'sell_modal_' : 'sell_animal_');
        const suffix = i.customId.split('_').slice(2).join('_'); 
        const modal = new ModalBuilder().setCustomId(modalId + suffix).setTitle(action === 'buy' ? 'شراء' : 'بيع');
        const input = new TextInputBuilder().setCustomId('quantity_input').setLabel('الكمية').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await i.showModal(modal);
    }
}

async function handleShopSelectMenu(i, client, sql) {
    try {
        const selected = i.values[0];
        if (selected === 'fishing_gear_menu') {
            await i.deferReply({ flags: MessageFlags.Ephemeral });
            const embed = new EmbedBuilder().setTitle('🎣 عـدة الـصـيـد').setDescription('اختر القسم الذي تريد تصفحه:').setColor(Colors.Aqua).setImage(BANNER_URL);
            const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('fishing_gear_sub_menu').setPlaceholder('اختر الفئة...').addOptions(
                { label: 'السنارات', value: 'gear_rods', emoji: '🎣' }, { label: 'القوارب', value: 'gear_boats', emoji: '🚤' }, { label: 'الطعوم', value: 'gear_baits', emoji: '🪱' }
            ));
            return await i.editReply({ embeds: [embed], components: [row] });
        }
        if (selected === 'upgrade_weapon') { await _handleWeaponUpgrade(i, client, sql); return; }
        if (selected === 'upgrade_skill') {
            await i.deferReply({ flags: MessageFlags.Ephemeral });
            const allUserSkills = getAllUserAvailableSkills(i.member, sql);
            if (allUserSkills.length === 0) return await i.editReply({ content: '❌ لا توجد مهارات متاحة.' });
            const skillOptions = allUserSkills.map(s => new StringSelectMenuOptionBuilder().setLabel(s.name).setDescription(s.description.substring(0,100)).setValue(s.id).setEmoji(s.emoji));
            const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('shop_skill_select_menu').setPlaceholder('اختر المهارة...').addOptions(skillOptions));
            return await i.editReply({ content: 'اختر مهارة:', components: [row] });
        }
        if (selected === 'exchange_xp') {
             const btn = new ButtonBuilder().setCustomId('open_xp_modal').setLabel('بدء التبادل').setStyle(ButtonStyle.Primary).setEmoji('🪙');
             const embed = new EmbedBuilder().setTitle('تبديل الخبرة').setDescription(`السعر: ${XP_EXCHANGE_RATE} مورا = 1 XP`).setColor(Colors.Blue).setImage(BANNER_URL).setThumbnail(THUMBNAILS.get('exchange_xp'));
             return await i.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)], flags: MessageFlags.Ephemeral });
        }
        
        // 🔥🔥 معالجة اختيار قائمة الجرعات 🔥🔥
        if (selected === 'potions_menu') {
            await _handlePotionSelect(i, client, sql);
            return;
        }

        // 🔥 هنا: نبحث في العنصر العام، إذا لم نجده، نبحث في الجرعات (فقط للتأكيد) 🔥
        let item = getBuyableItems().find(it => it.id === selected);
        if (!item) item = getPotionItems().find(it => it.id === selected);

        if (item) {
             const paginationEmbed = buildPaginatedItemEmbed(selected);
             if (paginationEmbed) return await i.reply({ ...paginationEmbed, flags: MessageFlags.Ephemeral });
        }
    } catch (e) { console.error(e); }
}

async function handleSkillSelectMenu(i, client, sql) {
    try {
        await i.deferUpdate(); 
        const skillId = i.values[0];
        const allUserSkills = getAllUserAvailableSkills(i.member, sql);
        const skillIndex = allUserSkills.findIndex(s => s.id === skillId);
        if (skillIndex === -1) return await i.editReply({ content: "خطأ: المهارة غير موجودة." });
        const paginationEmbed = buildSkillEmbedWithPagination(allUserSkills, skillIndex, sql, i);
        await i.editReply({ content: null, ...paginationEmbed });
    } catch (error) { console.error(error); }
}

module.exports = {
    handleShopModal,
    handleShopSelectMenu,
    handleShopInteractions,
    handleSkillSelectMenu,
    updateMarketPrices
};
