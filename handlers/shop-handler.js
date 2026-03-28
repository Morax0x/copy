const { 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ComponentType, 
    Colors, 
    MessageFlags,
    EmbedBuilder
} = require("discord.js");

let addXPAndCheckLevel;
try { ({ addXPAndCheckLevel } = require('../handler-utils.js')); } 
catch (e) { try { ({ addXPAndCheckLevel } = require('./handler-utils.js')); } catch (e2) {} }

let utils;
try { utils = require('./utils.js'); } 
catch (e) { try { utils = require('./shop_system/utils.js'); } catch (e2) { utils = {}; } }

const { 
    potionItems = [], rodsConfig = [], boatsConfig = [], baitsConfig = [], 
    EMOJI_MORA = '<:mora:1435647151349698621>', BANNER_URL, THUMBNAILS, 
    ensureInventoryTable, sendShopLog 
} = utils;

const shopItems = require('../json/shop-items.json');
const CUSTOM_XP_RATE = 5; 
const MAX_POTION_LIMIT = 999;

let generateShopImage;
try { generateShopImage = require('../generators/shop-generator.js').generateShopImage; } 
catch (e) { try { generateShopImage = require('../../generators/shop-generator.js').generateShopImage; } catch(e2) {} }

async function handlePurchaseWithCoupons(interaction, itemData, quantity, totalPrice, client, db, callbackType) {
    const member = interaction.member; 
    const guildID = interaction.guild.id; 
    const userID = member.id;
    
    let bossCouponRes;
    try { bossCouponRes = await db.query(`SELECT * FROM user_coupons WHERE "guildID" = $1 AND "userID" = $2 AND "isUsed" = 0 LIMIT 1`, [guildID, userID]); }
    catch(e) { bossCouponRes = await db.query(`SELECT * FROM user_coupons WHERE guildid = $1 AND userid = $2 AND isused = 0 LIMIT 1`, [guildID, userID]).catch(()=>({rows:[]})); }
    const bossCoupon = bossCouponRes.rows[0];
    
    let roleCouponsRes;
    try { roleCouponsRes = await db.query(`SELECT * FROM role_coupons_config WHERE "guildID" = $1`, [guildID]); }
    catch(e) { roleCouponsRes = await db.query(`SELECT * FROM role_coupons_config WHERE guildid = $1`, [guildID]).catch(()=>({rows:[]})); }
    
    let bestRoleCoupon = null;
    for (const config of roleCouponsRes.rows) {
        if (member.roles.cache.has(config.roleID || config.roleid)) {
            if (!bestRoleCoupon || Number(config.discountPercent || config.discountpercent) > Number(bestRoleCoupon.discountPercent || bestRoleCoupon.discountpercent)) bestRoleCoupon = config;
        }
    }
    
    let isRoleCouponReady = false;
    if (bestRoleCoupon) {
        let usageDataRes;
        try { usageDataRes = await db.query(`SELECT "lastUsedTimestamp" FROM user_role_coupon_usage WHERE "guildID" = $1 AND "userID" = $2`, [guildID, userID]); }
        catch(e) { usageDataRes = await db.query(`SELECT lastusedtimestamp FROM user_role_coupon_usage WHERE guildid = $1 AND userid = $2`, [guildID, userID]).catch(()=>({rows:[]})); }
        const usageData = usageDataRes.rows[0];
        const fifteenDaysMs = 15 * 24 * 60 * 60 * 1000;
        if (!usageData || (Date.now() - Number(usageData.lastUsedTimestamp || usageData.lastusedtimestamp) > fifteenDaysMs)) isRoleCouponReady = true; 
        else bestRoleCoupon = null; 
    }
    
    if (!bossCoupon && !bestRoleCoupon) return processFinalPurchase(interaction, itemData, quantity, totalPrice, 0, 'none', client, db, callbackType);

    const row = new ActionRowBuilder();
    let couponMessage = "";
    let finalPriceWithBoss = totalPrice, finalPriceWithRole = totalPrice;

    if (bossCoupon) {
        const disCount = Number(bossCoupon.discountPercent || bossCoupon.discountpercent);
        finalPriceWithBoss = Math.floor(totalPrice * (1 - (disCount / 100)));
        couponMessage += `✶ لديـك كـوبـون خـصم بقيـمـة: **${disCount}%** هل تريـد استعمـالـه؟\n✬ اذا استعملته ستدفـع: **${finalPriceWithBoss.toLocaleString()}** ${EMOJI_MORA} - بدلاً مـن: **${totalPrice.toLocaleString()}**\n\n`;
        row.addComponents(new ButtonBuilder().setCustomId('use_boss_coupon').setLabel(`استعمـال (${disCount}%)`).setStyle(ButtonStyle.Success).setEmoji('🎫'));
    }
    if (bestRoleCoupon && isRoleCouponReady) {
        const disCount = Number(bestRoleCoupon.discountPercent || bestRoleCoupon.discountpercent);
        finalPriceWithRole = Math.floor(totalPrice * (1 - (disCount / 100)));
        couponMessage += `✶ لديـك كـوبـون خـصم بقيـمـة: **${disCount}%** هل تريـد استعمـالـه؟\n✬ اذا استعملته ستدفـع: **${finalPriceWithRole.toLocaleString()}** ${EMOJI_MORA} - بدلاً مـن: **${totalPrice.toLocaleString()}**\n\n`;
        row.addComponents(new ButtonBuilder().setCustomId('use_role_coupon').setLabel(`استعمـال (${disCount}%)`).setStyle(ButtonStyle.Success).setEmoji('🛡️'));
    }
    row.addComponents(new ButtonBuilder().setCustomId('skip_coupon').setLabel('تخـطـي (دفع كامل)').setStyle(ButtonStyle.Primary));

    const replyData = { content: `**🛍️ خيـارات الـدفع:**\n\n${couponMessage}`, components: [row], flags: MessageFlags.Ephemeral, fetchReply: true };
    let msg; 
    if (interaction.replied || interaction.deferred) msg = await interaction.followUp(replyData); 
    else msg = await interaction.reply(replyData);
    
    const filter = i => i.user.id === userID;
    const collector = msg.createMessageComponentCollector({ filter, componentType: ComponentType.Button, time: 60000 });
    collector.on('collect', async i => {
        await i.deferUpdate(); 
        await i.editReply({ content: "⏳ جاري تنفيذ الطلب...", components: [] });
        if (i.customId === 'skip_coupon') await processFinalPurchase(i, itemData, quantity, totalPrice, 0, 'none', client, db, callbackType);
        else if (i.customId === 'use_boss_coupon') await processFinalPurchase(i, itemData, quantity, finalPriceWithBoss, Number(bossCoupon.discountPercent || bossCoupon.discountpercent), 'boss', client, db, callbackType, bossCoupon.id);
        else if (i.customId === 'use_role_coupon') await processFinalPurchase(i, itemData, quantity, finalPriceWithRole, Number(bestRoleCoupon.discountPercent || bestRoleCoupon.discountpercent), 'role', client, db, callbackType);
        collector.stop();
    });
}

async function processFinalPurchase(interaction, itemData, quantity, finalPrice, discountUsed, couponType, client, db, callbackType, couponIdToDelete = null) {
    let userData = await client.getLevel(interaction.user.id, interaction.guild.id);
    if (!userData) userData = { ...client.defaultData, user: interaction.user.id, guild: interaction.guild.id };
      
    const errorReply = async (msgContent) => {
        if (interaction.deferred || interaction.replied) return await interaction.followUp({ content: msgContent, flags: MessageFlags.Ephemeral }); 
        else return await interaction.reply({ content: msgContent, flags: MessageFlags.Ephemeral });
    };

    if (Number(userData.mora) < finalPrice) {
        const userBank = Number(userData.bank) || 0; 
        let errorMsg = `❌ **عذراً، لا تملك مورا كافية!**\nالمطلوب بالكاش: **${finalPrice.toLocaleString()}** ${EMOJI_MORA}`;
        if (userBank >= finalPrice) errorMsg += `\n\n💡 **تلميح:** ليس لديك كاش كافٍ، ولكن لديك **${userBank.toLocaleString()}** في البنك.`;
        return await errorReply(errorMsg);
    }

    if (callbackType === 'item') {
        if (itemData.category === 'potions' || itemData.id.startsWith('potion_')) {
            let invCheckRes = await db.query(`SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [interaction.user.id, interaction.guild.id, itemData.id]).catch(()=>({rows:[]}));
            let currQty = invCheckRes.rows[0] ? Number(invCheckRes.rows[0].quantity) : 0;
            if (currQty + quantity > MAX_POTION_LIMIT) return await errorReply(`🚫 **لا يمكنك الشراء!**\nحقيبتك لا تتسع للمزيد من هذا العنصر. الحد الأقصى هو **${MAX_POTION_LIMIT}**.`);
        } 
    }

    userData.mora = Number(userData.mora) - finalPrice; 
    userData.shop_purchases = (Number(userData.shop_purchases) || 0) + 1;
    await client.setLevel(userData);
      
    if (couponType === 'boss' && couponIdToDelete) {
        try { await db.query(`DELETE FROM user_coupons WHERE "id" = $1`, [couponIdToDelete]); }
        catch(e) { await db.query(`DELETE FROM user_coupons WHERE id = $1`, [couponIdToDelete]).catch(()=>{}); }
    }
    else if (couponType === 'role') {
        try { await db.query(`INSERT INTO user_role_coupon_usage ("guildID", "userID", "lastUsedTimestamp") VALUES ($1, $2, $3) ON CONFLICT ("guildID", "userID") DO UPDATE SET "lastUsedTimestamp" = EXCLUDED."lastUsedTimestamp"`, [interaction.guild.id, interaction.user.id, Date.now()]); }
        catch(e) { await db.query(`INSERT INTO user_role_coupon_usage (guildid, userid, lastusedtimestamp) VALUES ($1, $2, $3) ON CONFLICT (guildid, userid) DO UPDATE SET lastusedtimestamp = EXCLUDED.lastusedtimestamp`, [interaction.guild.id, interaction.user.id, Date.now()]).catch(()=>{}); }
    }

    if (callbackType === 'item') {
        if (itemData.id === 'personal_guard_1d') { 
            userData.hasGuard = (Number(userData.hasGuard) || 0) + 3; 
            userData.guardExpires = 0; 
            await client.setLevel(userData); 
        }
        else if (itemData.id.startsWith('potion_')) { 
            await ensureInventoryTable(db); 
            try { await db.query(`INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, 1) ON CONFLICT("guildID", "userID", "itemID") DO UPDATE SET "quantity" = LEAST(user_inventory."quantity" + 1, 999)`, [interaction.guild.id, interaction.user.id, itemData.id]); }
            catch(e) { await db.query(`INSERT INTO user_inventory (guildid, userid, itemid, quantity) VALUES ($1, $2, $3, 1) ON CONFLICT(guildid, userid, itemid) DO UPDATE SET quantity = LEAST(user_inventory.quantity + 1, 999)`, [interaction.guild.id, interaction.user.id, itemData.id]).catch(()=>{}); }
        }
        else if (itemData.id === 'streak_shield') {
            let existingStreakRes = await db.query(`SELECT * FROM streaks WHERE "userID" = $1 AND "guildID" = $2`, [interaction.user.id, interaction.guild.id]).catch(()=> db.query(`SELECT * FROM streaks WHERE userid = $1 AND guildid = $2`, [interaction.user.id, interaction.guild.id]).catch(()=>({rows:[]})));
            const existingStreak = existingStreakRes.rows[0];
            const id = existingStreak?.id || `${interaction.guild.id}-${interaction.user.id}`;
            try { await db.query(`INSERT INTO streaks ("id", "guildID", "userID", "streakCount", "lastMessageTimestamp", "hasGracePeriod", "hasItemShield", "nicknameActive", "hasReceivedFreeShield", "separator", "dmNotify", "highestStreak") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT ("id") DO UPDATE SET "hasItemShield" = "hasItemShield" + 1`, [id, interaction.guild.id, interaction.user.id, existingStreak?.streakCount || existingStreak?.streakcount || 0, existingStreak?.lastMessageTimestamp || existingStreak?.lastmessagetimestamp || 0, existingStreak?.hasGracePeriod || existingStreak?.hasgraceperiod || 0, 1, existingStreak?.nicknameActive ?? existingStreak?.nicknameactive ?? 1, existingStreak?.hasReceivedFreeShield || existingStreak?.hasreceivedfreeshield || 0, existingStreak?.separator || '»', existingStreak?.dmNotify ?? existingStreak?.dmnotify ?? 1, existingStreak?.highestStreak || existingStreak?.higheststreak || 0]); }
            catch(e) { await db.query(`INSERT INTO streaks (id, guildid, userid, streakcount, lastmessagetimestamp, hasgraceperiod, hasitemshield, nicknameactive, hasreceivedfreeshield, separator, dmnotify, higheststreak) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (id) DO UPDATE SET hasitemshield = hasitemshield + 1`, [id, interaction.guild.id, interaction.user.id, existingStreak?.streakCount || existingStreak?.streakcount || 0, existingStreak?.lastMessageTimestamp || existingStreak?.lastmessagetimestamp || 0, existingStreak?.hasGracePeriod || existingStreak?.hasgraceperiod || 0, 1, existingStreak?.nicknameActive ?? existingStreak?.nicknameactive ?? 1, existingStreak?.hasReceivedFreeShield || existingStreak?.hasreceivedfreeshield || 0, existingStreak?.separator || '»', existingStreak?.dmNotify ?? existingStreak?.dmnotify ?? 1, existingStreak?.highestStreak || existingStreak?.higheststreak || 0]).catch(()=>{}); }
        }
        else if (itemData.id === 'streak_shield_media') {
            let existingMediaStreakRes = await db.query(`SELECT * FROM media_streaks WHERE "userID" = $1 AND "guildID" = $2`, [interaction.user.id, interaction.guild.id]).catch(()=> db.query(`SELECT * FROM media_streaks WHERE userid = $1 AND guildid = $2`, [interaction.user.id, interaction.guild.id]).catch(()=>({rows:[]})));
            const existingMediaStreak = existingMediaStreakRes.rows[0];
            const id = existingMediaStreak?.id || `${interaction.guild.id}-${interaction.user.id}`;
            try { await db.query(`INSERT INTO media_streaks ("id", "guildID", "userID", "streakCount", "lastMediaTimestamp", "hasGracePeriod", "hasItemShield", "hasReceivedFreeShield", "dmNotify", "highestStreak") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT ("id") DO UPDATE SET "hasItemShield" = "hasItemShield" + 1`, [id, interaction.guild.id, interaction.user.id, existingMediaStreak?.streakCount || existingMediaStreak?.streakcount || 0, existingMediaStreak?.lastMediaTimestamp || existingMediaStreak?.lastmediatimestamp || 0, existingMediaStreak?.hasGracePeriod || existingMediaStreak?.hasgraceperiod || 0, 1, existingMediaStreak?.hasReceivedFreeShield || existingMediaStreak?.hasreceivedfreeshield || 0, existingMediaStreak?.dmNotify ?? existingMediaStreak?.dmnotify ?? 1, existingMediaStreak?.highestStreak || existingMediaStreak?.higheststreak || 0]); }
            catch(e) { await db.query(`INSERT INTO media_streaks (id, guildid, userid, streakcount, lastmediatimestamp, hasgraceperiod, hasitemshield, hasreceivedfreeshield, dmnotify, higheststreak) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (id) DO UPDATE SET hasitemshield = hasitemshield + 1`, [id, interaction.guild.id, interaction.user.id, existingMediaStreak?.streakCount || existingMediaStreak?.streakcount || 0, existingMediaStreak?.lastMediaTimestamp || existingMediaStreak?.lastmediatimestamp || 0, existingMediaStreak?.hasGracePeriod || existingMediaStreak?.hasgraceperiod || 0, 1, existingMediaStreak?.hasReceivedFreeShield || existingMediaStreak?.hasreceivedfreeshield || 0, existingMediaStreak?.dmNotify ?? existingMediaStreak?.dmnotify ?? 1, existingMediaStreak?.highestStreak || existingMediaStreak?.higheststreak || 0]).catch(()=>{}); }
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
                try { await db.query(`INSERT INTO user_buffs ("userID", "guildID", "buffType", "multiplier", "expiresAt", "buffPercent") VALUES ($1, $2, $3, $4, $5, $6)`, [interaction.user.id, interaction.guild.id, 'xp', multiplier, expiresAt, buffPercent]); }
                catch(e) { await db.query(`INSERT INTO user_buffs (userid, guildid, bufftype, multiplier, expiresat, buffpercent) VALUES ($1, $2, $3, $4, $5, $6)`, [interaction.user.id, interaction.guild.id, 'xp', multiplier, expiresAt, buffPercent]).catch(()=>{}); }
            }
        }
        else if (itemData.id === 'vip_role_3d') {
            let settingsRes;
            try { settingsRes = await db.query(`SELECT "vipRoleID" FROM settings WHERE "guild" = $1`, [interaction.guild.id]); }
            catch(e) { settingsRes = await db.query(`SELECT viproleid FROM settings WHERE guild = $1`, [interaction.guild.id]).catch(()=>({rows:[]})); }
            const settings = settingsRes.rows[0];
            if (settings && (settings.vipRoleID || settings.viproleid)) {
                const member = await interaction.guild.members.fetch(interaction.user.id).catch(()=>{});
                if (member) await member.roles.add(settings.vipRoleID || settings.viproleid).catch(()=>{});
                const expiresAt = Date.now() + (3 * 24 * 60 * 60 * 1000);
                try { await db.query(`INSERT INTO temporary_roles ("userID", "guildID", "roleID", "expiresAt") VALUES ($1, $2, $3, $4) ON CONFLICT ("userID", "guildID", "roleID") DO UPDATE SET "expiresAt" = EXCLUDED."expiresAt"`, [interaction.user.id, interaction.guild.id, settings.vipRoleID || settings.viproleid, expiresAt]); }
                catch(e) { await db.query(`INSERT INTO temporary_roles (userid, guildid, roleid, expiresat) VALUES ($1, $2, $3, $4) ON CONFLICT (userid, guildid, roleid) DO UPDATE SET expiresat = EXCLUDED.expiresat`, [interaction.user.id, interaction.guild.id, settings.vipRoleID || settings.viproleid, expiresAt]).catch(()=>{}); }
            }
        }
        else if (itemData.id === 'farm_worker_3d') {
            const duration = 3 * 24 * 60 * 60 * 1000;
            let existingWorkerRes = await db.query(`SELECT "expiresAt" FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'farm_worker'`, [interaction.user.id, interaction.guild.id]).catch(()=> db.query(`SELECT expiresat FROM user_buffs WHERE userid = $1 AND guildid = $2 AND bufftype = 'farm_worker'`, [interaction.user.id, interaction.guild.id]).catch(()=>({rows:[]})));
            const existingWorker = existingWorkerRes.rows[0];
            let newExpiresAt = Date.now() + duration;
            if (existingWorker && Number(existingWorker.expiresAt || existingWorker.expiresat) > Date.now()) {
                newExpiresAt = Number(existingWorker.expiresAt || existingWorker.expiresat) + duration;
            }
            try { await db.query(`INSERT INTO user_buffs ("userID", "guildID", "buffType", "multiplier", "expiresAt", "buffPercent") VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT ("userID", "guildID", "buffType") DO UPDATE SET "expiresAt" = EXCLUDED."expiresAt"`, [interaction.user.id, interaction.guild.id, 'farm_worker', 0, newExpiresAt, 0]); }
            catch(e) { await db.query(`INSERT INTO user_buffs (userid, guildid, bufftype, multiplier, expiresat, buffpercent) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (userid, guildid, bufftype) DO UPDATE SET expiresat = EXCLUDED.expiresat`, [interaction.user.id, interaction.guild.id, 'farm_worker', 0, newExpiresAt, 0]).catch(()=>{}); }
        }
        else if (itemData.id === 'change_race') {
            try {
                let allRaceRolesRes = await db.query(`SELECT "roleID", "raceName" FROM race_roles WHERE "guildID" = $1`, [interaction.guild.id]).catch(()=> db.query(`SELECT roleid, racename FROM race_roles WHERE guildid = $1`, [interaction.guild.id]).catch(()=>({rows:[]})));
                const raceRoleIDs = allRaceRolesRes.rows.map(r => r.roleID || r.roleid);
                const userRaceRole = interaction.member.roles.cache.find(r => raceRoleIDs.includes(r.id));
                if (userRaceRole) { await interaction.member.roles.remove(userRaceRole); }
            } catch (err) {}
              
            const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000);
            try {
                await db.query(`INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [interaction.guild.id, interaction.user.id, -5, expiresAt, 'xp', -0.05]);
                await db.query(`INSERT INTO user_buffs ("guildID", "userID", "buffPercent", "expiresAt", "buffType", "multiplier") VALUES ($1, $2, $3, $4, $5, $6)`, [interaction.guild.id, interaction.user.id, -5, expiresAt, 'mora', -0.05]);
            } catch(e) {}
        }
    }

    let successMsg = `📦 **العنصر:** ${itemData.name || 'Unknown'}\n💰 **التكلفة:** ${finalPrice.toLocaleString()} ${EMOJI_MORA}`;
    if (discountUsed > 0) successMsg += `\n📉 **تم تطبيق خصم:** ${discountUsed}%`;
    if (itemData.id === 'farm_worker_3d') successMsg += `\n👨‍🌾 **عامل المزرعة بدأ العمل!** سيقوم بحصاد المحاصيل وإطعام الحيوانات.`;
    
    const successEmbed = new EmbedBuilder()
        .setTitle('✅ تمت عملية الشراء بنجاح')
        .setColor(Colors.Green)
        .setDescription(successMsg)
        .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() });

    if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: "✅ تم تجهيز الطلب وإرسال الفاتورة.", components: [] }).catch(()=>{});
    } else {
        await interaction.reply({ content: "✅ تم تجهيز الطلب وإرسال الفاتورة.", flags: MessageFlags.Ephemeral }).catch(()=>{});
    }
    
    await interaction.channel.send({ content: `<@${interaction.user.id}>`, embeds: [successEmbed] }).catch(()=>{});
    sendShopLog(client, interaction.guild.id, interaction.member, itemData.name || "Unknown", finalPrice, `شراء ${discountUsed > 0 ? '(مع كوبون)' : ''}`);
}

async function _handleShopButton(i, client, db) {
    try {
        const userId = i.user.id; 
        const guildId = i.guild.id; 
        const boughtItemId = i.customId.replace('buy_item_', ''); 
          
        let item = shopItems.find(it => it.id === boughtItemId) || potionItems.find(it => it.id === boughtItemId);
        if (!item) return await i.reply({ content: '❌ هذا العنصر غير موجود!', flags: MessageFlags.Ephemeral });
        
        let userData = await client.getLevel(userId, guildId); 
        if (!userData) userData = { ...client.defaultData, user: userId, guild: guildId };
          
        const NON_DISCOUNTABLE = ['xp_buff_1d_3', 'xp_buff_1d_7', 'xp_buff_2d_10'];
        
        if (!i.replied && !i.deferred) await i.deferReply({ flags: MessageFlags.Ephemeral });

        if (item.id === 'personal_guard_1d') {
            if (Number(userData.hasGuard || 0) >= 3) {
                return await i.editReply({ content: `🚫 **لا يمكنك الشراء!**\nلديك بالفعل **${userData.hasGuard}** محاولات حماية من الحارس الشخصي. (الحد الأقصى 3)` });
            }
        }
        else if (item.id === 'streak_shield') {
            let existingRes = await db.query(`SELECT "hasItemShield" FROM streaks WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]).catch(()=> db.query(`SELECT hasitemshield FROM streaks WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]})));
            const currentShields = Number(existingRes.rows[0]?.hasItemShield || existingRes.rows[0]?.hasitemshield || 0);
            if (currentShields >= 3) {
                return await i.editReply({ content: `🚫 **درعك ممتلئ!**\nلديك **${currentShields}** دروع ستريك نشطة حالياً. لا يمكنك شراء المزيد حتى يتم استهلاكها.` });
            }
        }
        else if (item.id === 'streak_shield_media') {
            let existingRes = await db.query(`SELECT "hasItemShield" FROM media_streaks WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]).catch(()=> db.query(`SELECT hasitemshield FROM media_streaks WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]})));
            const currentShields = Number(existingRes.rows[0]?.hasItemShield || existingRes.rows[0]?.hasitemshield || 0);
            if (currentShields >= 3) {
                return await i.editReply({ content: `🚫 **درع الميديا ممتلئ!**\nلديك **${currentShields}** دروع نشطة حالياً. لا يمكنك شراء المزيد.` });
            }
        }
        else if (item.id === 'farm_worker_3d') {
            let existingWorkerRes = await db.query(`SELECT "expiresAt" FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'farm_worker'`, [userId, guildId]).catch(()=> db.query(`SELECT expiresat FROM user_buffs WHERE userid = $1 AND guildid = $2 AND bufftype = 'farm_worker'`, [userId, guildId]).catch(()=>({rows:[]})));
            const existingWorker = existingWorkerRes.rows[0];
            const expiresAtMs = Number(existingWorker?.expiresAt || existingWorker?.expiresat || 0);
            const remainingDays = Math.ceil((expiresAtMs - Date.now()) / (24 * 60 * 60 * 1000));
            
            if (remainingDays >= 6) {
                return await i.editReply({ content: `🚫 **لا يمكنك توظيف عمال إضافيين!**\nوقت العامل الحالي يتجاوز الحد الأقصى المسموح (يتبقى له ${remainingDays} أيام).` });
            }
        }
        else if (item.id.startsWith('xp_buff_')) {
            let getActiveBuffRes = await db.query(`SELECT * FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'xp' AND "expiresAt" > $3`, [userId, guildId, Date.now()]).catch(()=> db.query(`SELECT * FROM user_buffs WHERE userid = $1 AND guildid = $2 AND bufftype = 'xp' AND expiresat > $3`, [userId, guildId, Date.now()]).catch(()=>({rows:[]})));
            const activeBuff = getActiveBuffRes.rows[0];
            if (activeBuff) {
                const replaceButton = new ButtonBuilder().setCustomId(`replace_buff_${item.id}`).setLabel("إلغاء القديم وشراء الجديد").setStyle(ButtonStyle.Danger);
                const cancelButton = new ButtonBuilder().setCustomId('cancel_purchase').setLabel("إلغاء").setStyle(ButtonStyle.Secondary);
                const row = new ActionRowBuilder().addComponents(replaceButton, cancelButton);
                return await i.editReply({ content: `⚠️ لديك معزز خبرة فعال بالفعل! (لا يمكن دمج معززين في نفس الوقت)`, components: [row], embeds: [] });
            }
        }

        if (NON_DISCOUNTABLE.includes(item.id) || item.id.startsWith('xp_buff_')) {
             if (Number(userData.mora) < item.price) {
                 const userBank = Number(userData.bank) || 0;
                 let msg = `❌ رصيدك غير كافي!`;
                 if (userBank >= item.price) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}** مورا، اسحب منها.`;
                 return await i.editReply({ content: msg });
             }
             await processFinalPurchase(i, item, 1, item.price, 0, 'none', client, db, 'item');
             return;
        }
        
        await handlePurchaseWithCoupons(i, item, 1, item.price, client, db, 'item');

    } catch (error) { 
        console.error("Error in shop button:", error); 
        if (i.replied || i.deferred) await i.followUp({ content: '❌ حدث خطأ.', flags: MessageFlags.Ephemeral }); 
        else await i.reply({ content: '❌ حدث خطأ.', flags: MessageFlags.Ephemeral }); 
    }
}

async function _handleReplaceGuard(i, client, db) {
    try {
        await i.deferUpdate();
        const userId = i.user.id; 
        const guildId = i.guild.id; 
        const item = shopItems.find(it => it.id === 'personal_guard_1d');
        let userData = await client.getLevel(userId, guildId); 
        if (!userData) userData = { ...client.defaultData, user: userId, guild: guildId };
        
        if (Number(userData.hasGuard || 0) >= 3) {
            return await i.followUp({ content: `🚫 لديك بالفعل **${userData.hasGuard}** محاولات من الحارس الشخصي (الحد الأقصى 3).`, components: [], embeds: [], flags: MessageFlags.Ephemeral });
        }

        if (Number(userData.mora) < item.price) {
            const userBank = Number(userData.bank) || 0;
            let msg = `❌ رصيدك غير كافي! تحتاج إلى **${item.price.toLocaleString()}** ${EMOJI_MORA}`;
            if (userBank >= item.price) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}** مورا.`;
            return await i.followUp({ content: msg, components: [], embeds: [], flags: MessageFlags.Ephemeral });
        }
        
        userData.mora = Number(userData.mora) - item.price; 
        userData.hasGuard = (Number(userData.hasGuard) || 0) + 3; 
        userData.guardExpires = 0; 
        userData.shop_purchases = (Number(userData.shop_purchases) || 0) + 1;
        await client.setLevel(userData);
        
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ تمت عملية التجديد بنجاح')
            .setColor(Colors.Green)
            .setDescription(`📦 **العنصر:** حارس شخصي\n💰 **التكلفة:** ${item.price.toLocaleString()} ${EMOJI_MORA}`)
            .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });

        await i.followUp({ content: "✅ تم تجهيز الطلب وإرسال الفاتورة.", flags: MessageFlags.Ephemeral });
        await i.channel.send({ content: `<@${i.user.id}>`, embeds: [successEmbed] });
        sendShopLog(client, guildId, i.member, "حارس شخصي (تجديد)", item.price, "شراء");
    } catch (error) { console.error(error); }
}

async function _handleReplaceBuffButton(i, client, db) {
    try {
        await i.deferUpdate();
        const userId = i.user.id; 
        const guildId = i.guild.id; 
        const newItemId = i.customId.replace('replace_buff_', '');
        const item = shopItems.find(it => it.id === newItemId);
        
        if (!item) return await i.followUp({ content: '❌ هذا العنصر غير موجود!', components: [], embeds: [], flags: MessageFlags.Ephemeral });
        
        let userData = await client.getLevel(userId, guildId); 
        if (!userData) userData = { ...client.defaultData, user: userId, guild: guildId };
        
        if (Number(userData.mora) < item.price) {
            const userBank = Number(userData.bank) || 0;
            let msg = `❌ رصيدك غير كافي! تحتاج إلى **${item.price.toLocaleString()}** ${EMOJI_MORA}`;
            if (userBank >= item.price) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}** مورا.`;
            return await i.followUp({ content: msg, components: [], embeds: [], flags: MessageFlags.Ephemeral });
        }
        
        userData.mora = Number(userData.mora) - item.price;
        
        await db.query(`DELETE FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'xp'`, [userId, guildId]).catch(()=> db.query(`DELETE FROM user_buffs WHERE userid = $1 AND guildid = $2 AND bufftype = 'xp'`, [userId, guildId]).catch(()=>{}));
        
        let expiresAt, multiplier, buffPercent;
        switch (item.id) {
            case 'xp_buff_1d_3': multiplier = 0.45; buffPercent = 45; expiresAt = Date.now() + (24 * 60 * 60 * 1000); break;
            case 'xp_buff_1d_7': multiplier = 0.70; buffPercent = 70; expiresAt = Date.now() + (48 * 60 * 60 * 1000); break;
            case 'xp_buff_2d_10': multiplier = 0.90; buffPercent = 90; expiresAt = Date.now() + (72 * 60 * 60 * 1000); break;
        }
        
        if (multiplier > 0) {
            await db.query(`INSERT INTO user_buffs ("userID", "guildID", "buffType", "multiplier", "expiresAt", "buffPercent") VALUES ($1, $2, $3, $4, $5, $6)`, [userId, guildId, 'xp', multiplier, expiresAt, buffPercent]).catch(()=> db.query(`INSERT INTO user_buffs (userid, guildid, bufftype, multiplier, expiresat, buffpercent) VALUES ($1, $2, $3, $4, $5, $6)`, [userId, guildId, 'xp', multiplier, expiresAt, buffPercent]).catch(()=>{}));
        }

        userData.shop_purchases = (Number(userData.shop_purchases) || 0) + 1;
        await client.setLevel(userData);
        
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ تمت عملية الشراء بنجاح')
            .setColor(Colors.Green)
            .setDescription(`📦 **العنصر:** ${item.name} (استبدال)\n💰 **التكلفة:** ${item.price.toLocaleString()} ${EMOJI_MORA}`)
            .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });

        await i.followUp({ content: "✅ تم تجهيز الطلب وإرسال الفاتورة.", flags: MessageFlags.Ephemeral });
        await i.channel.send({ content: `<@${i.user.id}>`, embeds: [successEmbed] });
        sendShopLog(client, guildId, i.member, item.name, item.price, "استبدال/شراء");
        
    } catch (error) { console.error(error); }
}

async function _handlePotionSelect(i, client, db) {
    if(i.replied || i.deferred) await i.followUp({ content: "جاري التحميل...", flags: MessageFlags.Ephemeral });
    else await i.deferReply({ flags: MessageFlags.Ephemeral });
      
    if (potionItems.length === 0) return i.editReply({ content: "❌ لا توجد جرعات متاحة حالياً." });

    const potionOptions = potionItems.slice(0, 25).map(p => {
        return { label: p.name, description: `${p.price.toLocaleString()} مورا | ${p.description.substring(0, 50)}`, value: `buy_item_${p.id}`, emoji: p.emoji };
    });

    const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('shop_buy_potion_menu').setPlaceholder('اختر الجرعة لشرائها...').addOptions(potionOptions));
    const embed = new EmbedBuilder().setTitle('🧪 متجر الجرعات السحرية').setDescription('اختر الجرعة التي تريد شراءها من القائمة بالأسفل.').setColor(Colors.Purple).setImage(BANNER_URL).setThumbnail(THUMBNAILS.get('potions_menu'));

    await i.editReply({ embeds: [embed], components: [row] });
}

async function _handleFishingMenu(i, client, db) {
    await i.deferReply({ flags: MessageFlags.Ephemeral }); 
    const embed = new EmbedBuilder().setTitle('🎣 عـدة الـصـيـد').setDescription('اختر القسم الذي تريد تصفحه:').setColor(Colors.Aqua).setImage(BANNER_URL);
    const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('fishing_gear_sub_menu').setPlaceholder('اختر الفئة...').addOptions(
        { label: 'السنارات', value: 'gear_rods', emoji: '🎣' }, { label: 'القوارب', value: 'gear_boats', emoji: '🚤' }, { label: 'الطعوم', value: 'gear_baits', emoji: '🪱' }
    ));
    await i.editReply({ embeds: [embed], components: [row] });
}

async function _handleRodSelect(i, client, db) {
    if(i.replied || i.deferred) await i.editReply("جاري التحميل..."); else await i.deferReply({ flags: MessageFlags.Ephemeral });
    let userDataRes = await db.query(`SELECT "rodLevel" FROM levels WHERE "user" = $1 AND "guild" = $2`, [i.user.id, i.guild.id]).catch(()=> db.query(`SELECT rodlevel FROM levels WHERE userid = $1 AND guildid = $2`, [i.user.id, i.guild.id]).catch(()=>({rows:[]})));
    let userData = userDataRes.rows[0];
    const currentLevel = userData ? (Number(userData.rodLevel || userData.rodlevel) || 1) : 1;
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

async function _handleBoatSelect(i, client, db) {
    if(i.replied || i.deferred) await i.editReply("جاري التحميل..."); else await i.deferReply({ flags: MessageFlags.Ephemeral });
    let userDataRes = await db.query(`SELECT "boatLevel" FROM levels WHERE "user" = $1 AND "guild" = $2`, [i.user.id, i.guild.id]).catch(()=> db.query(`SELECT boatlevel FROM levels WHERE userid = $1 AND guildid = $2`, [i.user.id, i.guild.id]).catch(()=>({rows:[]})));
    let userData = userDataRes.rows[0];
    const currentLevel = userData ? (Number(userData.boatLevel || userData.boatlevel) || 1) : 1;
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

async function _handleBaitBuy(i, client, db) {
    if(!i.deferred && !i.replied) await i.deferReply({ flags: MessageFlags.Ephemeral });
    const baitId = i.values[0].replace('buy_bait_', '');
    const bait = baitsConfig.find(b => b.id === baitId);
    
    const qty = 5; 
    const unitPrice = Math.round(bait.price / 5);
    const cost = unitPrice * qty; 
    
    let userData = await client.getLevel(i.user.id, i.guild.id);
    if (Number(userData.mora) < cost) {
        const userBank = Number(userData.bank) || 0;
        let msg = `❌ رصيدك غير كافي لشراء هذه الحزمة! تحتاج إلى **${cost.toLocaleString()}** ${EMOJI_MORA}`;
        if (userBank >= cost) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}** مورا، اسحب منها.`;
        return i.editReply(msg);
    }
    userData.mora = Number(userData.mora) - cost; 
    await client.setLevel(userData);
    
    try { await db.query(`INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, $4) ON CONFLICT("guildID", "userID", "itemID") DO UPDATE SET "quantity" = LEAST(user_inventory."quantity" + $5, 1000)`, [i.guild.id, i.user.id, baitId, qty, qty]); }
    catch(e) { await db.query(`INSERT INTO user_inventory (guildid, userid, itemid, quantity) VALUES ($1, $2, $3, $4) ON CONFLICT(guildid, userid, itemid) DO UPDATE SET quantity = LEAST(user_inventory.quantity + $5, 1000)`, [i.guild.id, i.user.id, baitId, qty, qty]).catch(()=>{}); }
    
    const successEmbed = new EmbedBuilder()
        .setTitle('✅ تمت عملية الشراء بنجاح')
        .setColor(Colors.Green)
        .setDescription(`📦 **العنصر:** حزمة (${qty} حبات) من ${bait.name}\n💰 **التكلفة:** ${cost.toLocaleString()} ${EMOJI_MORA}`)
        .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });

    await i.editReply({ content: "✅ تم تجهيز الطلب وإرسال الفاتورة." });
    await i.channel.send({ content: `<@${i.user.id}>`, embeds: [successEmbed] });
    sendShopLog(client, i.guild.id, i.member, `حزمة طعم: ${bait.name} (x${qty})`, cost, "شراء");
}

async function handleShopModal(i, client, db) {
    if (i.customId === 'exchange_xp_modal') {
        try {
            await i.deferReply({ flags: MessageFlags.Ephemeral });
            const userId = i.user.id; 
            const guildId = i.guild.id;
            
            let userLoanRes = await db.query(`SELECT 1 FROM user_loans WHERE "userID" = $1 AND "guildID" = $2 AND "remainingAmount" > 0`, [userId, guildId]).catch(()=> db.query(`SELECT 1 FROM user_loans WHERE userid = $1 AND guildid = $2 AND remainingamount > 0`, [userId, guildId]).catch(()=>({rows:[]})));
            if (userLoanRes.rows.length > 0) return await i.editReply({ content: `❌ عليك قرض.` });
            
            let userData = await client.getLevel(userId, guildId); 
            if (!userData) userData = { ...client.defaultData, user: userId, guild: guildId };
            
            const userMora = Number(userData.mora) || 0;
            const amountString = i.fields.getTextInputValue('xp_amount_input').trim().toLowerCase();
            let amountToBuy = 0;
            
            if (amountString === 'all') amountToBuy = Math.floor(userMora / CUSTOM_XP_RATE);
            else amountToBuy = parseInt(amountString.replace(/,/g, ''));
            
            if (isNaN(amountToBuy) || amountToBuy <= 0) return await i.editReply({ content: '❌ رقم غير صالح.' });
            
            const totalCost = amountToBuy * CUSTOM_XP_RATE;
            
            if (userMora < totalCost) {
                const userBank = Number(userData.bank) || 0;
                let msg = `❌ رصيدك غير كافي.`;
                if (userBank >= totalCost) msg += `\n💡 لديك في البنك **${userBank.toLocaleString()}** مورا.`;
                return await i.editReply({ content: msg });
            }
            
            userData.mora = Number(userData.mora) - totalCost; 
            
            if (addXPAndCheckLevel) {
                await addXPAndCheckLevel(client, i.member, db, amountToBuy, 0, false).catch(()=>{});
            } else {
                userData.xp = Number(userData.xp) + amountToBuy; 
                userData.totalXP = Number(userData.totalXP || userData.totalxp || 0) + amountToBuy;
                await client.setLevel(userData);
            }

            const successEmbed = new EmbedBuilder()
                .setTitle('✅ تمت عملية الشراء بنجاح')
                .setColor(Colors.Green)
                .setDescription(`📦 **العنصر:** ${amountToBuy.toLocaleString()} XP\n💰 **التكلفة:** ${totalCost.toLocaleString()} ${EMOJI_MORA}`)
                .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });

            await i.editReply({ content: "✅ تم تجهيز الطلب وإرسال الفاتورة." });
            await i.channel.send({ content: `<@${i.user.id}>`, embeds: [successEmbed] });
            sendShopLog(client, guildId, i.member, `شراء ${amountToBuy} XP`, totalCost, "تبديل");
        } catch (e) { console.error(e); }
        return true;
    }

    if (i.customId === 'shop_buy_reply_modal') {
        const trigger = i.fields.getTextInputValue('reply_trigger').trim();
        const response = i.fields.getTextInputValue('reply_response').trim();
        const price = 10000;
        await i.deferReply({ flags: MessageFlags.Ephemeral });
        let userDataRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [i.user.id, i.guild.id]).catch(()=> db.query(`SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [i.user.id, i.guild.id]).catch(()=>({rows:[]})));
        const userData = userDataRes.rows[0];
        if (!userData || Number(userData.mora || userData.mora) < price) return i.editReply(`❌ رصيدك غير كافي.`);
        let existingRes = await db.query(`SELECT 1 FROM auto_responses WHERE "guildID" = $1 AND "trigger" = $2`, [i.guild.id, trigger]).catch(()=> db.query(`SELECT 1 FROM auto_responses WHERE guildid = $1 AND trigger = $2`, [i.guild.id, trigger]).catch(()=>({rows:[]})));
        if (existingRes.rows.length > 0) return i.editReply(`❌ هذا الرد موجود مسبقاً.`);
        try {
            await db.query(`UPDATE levels SET "mora" = "mora" - $1 WHERE "user" = $2 AND "guild" = $3`, [price, i.user.id, i.guild.id]).catch(()=> db.query(`UPDATE levels SET mora = mora - $1 WHERE userid = $2 AND guildid = $3`, [price, i.user.id, i.guild.id]).catch(()=>{}));
            const expiresAt = Date.now() + (3 * 24 * 60 * 60 * 1000);
            await db.query(`INSERT INTO auto_responses ("guildID", "trigger", "response", "matchType", "cooldown", "createdBy", "expiresAt") VALUES ($1, $2, $3, 'exact', 600, $4, $5)`, [i.guild.id, trigger, response, i.user.id, expiresAt]).catch(()=> db.query(`INSERT INTO auto_responses (guildid, trigger, response, matchtype, cooldown, createdby, expiresat) VALUES ($1, $2, $3, 'exact', 600, $4, $5)`, [i.guild.id, trigger, response, i.user.id, expiresAt]).catch(()=>{}));
            
            const successEmbed = new EmbedBuilder()
                .setTitle('✅ تمت عملية الشراء بنجاح')
                .setColor(Colors.Green)
                .setDescription(`📦 **العنصر:** رد تلقائي (${trigger})\n💰 **التكلفة:** ${price.toLocaleString()} ${EMOJI_MORA}`)
                .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });

            await i.editReply({ content: "✅ تم تجهيز الطلب وإرسال الفاتورة." });
            await i.channel.send({ content: `<@${i.user.id}>`, embeds: [successEmbed] });
            sendShopLog(client, i.guild.id, i.member, `رد تلقائي: ${trigger}`, price, "شراء");
        } catch (e) { console.error(e); await i.editReply(`❌ حدث خطأ.`); }
        return true;
    }
    return false;
}

async function handleShopInteractions(i, client, db) {
    if (i.customId === 'shop_open_menu' || i.customId.startsWith('shop_cat_')) {
        if (!i.deferred && !i.replied) {
            if (i.customId === 'shop_open_menu') {
                await i.deferReply({ flags: MessageFlags.Ephemeral });
            } else {
                await i.deferUpdate();
            }
        }

        const userId = i.user.id;
        const guildId = i.guild.id;

        let userData = await client.getLevel(userId, guildId);
        if (!userData) {
            let dbRes = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [userId, guildId]).catch(()=> db.query(`SELECT * FROM levels WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]})));
            userData = dbRes.rows[0] || { level: 0, mora: 0, bank: 0 };
        }

        let targetCategory = 'general';
        if (i.customId.startsWith('shop_cat_')) {
            targetCategory = i.customId.replace('shop_cat_', '');
        }

        const categoryItems = shopItems.filter(item => item.category === targetCategory);
        if (categoryItems.length === 0) return i.editReply({ content: "❌ لا توجد عناصر في هذا القسم." });

        let categoryNameAr = 'السوق العام';
        if (targetCategory === 'profession') categoryNameAr = 'المهن والحرف';
        if (targetCategory === 'premium') categoryNameAr = 'الخدمات المميزة';

        if (!generateShopImage) return i.editReply({ content: "❌ نظام الرسم غير متوفر." });
        const imageBuffer = await generateShopImage(i.user, userData, categoryItems, categoryNameAr);

        const buyOptions = categoryItems.map(item => ({
            label: item.name,
            description: `السعر: ${item.price} مورا | ${item.description.substring(0, 50)}`,
            value: `buy_item_${item.id}`,
            emoji: item.emoji || '📦'
        }));

        const selectMenuRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('shop_buy_select')
                .setPlaceholder('🛒 اختر عنصراً لشرائه من هذه الصفحة...')
                .addOptions(buyOptions)
        );

        const categoryRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('shop_cat_general')
                .setLabel('السوق العام')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(targetCategory === 'general'),
            new ButtonBuilder()
                .setCustomId('shop_cat_profession')
                .setLabel('المهن والحرف')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(targetCategory === 'profession'),
            new ButtonBuilder()
                .setCustomId('shop_cat_premium')
                .setLabel('الخدمات المميزة')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(targetCategory === 'premium')
        );

        const replyData = {
            content: `**مرحباً بك في متجر الإمبراطورية** يا <@${userId}>`,
            files: [{ attachment: imageBuffer, name: 'empire_shop.png' }],
            components: [selectMenuRow, categoryRow]
        };

        return await i.editReply(replyData);
    }

    if (i.isStringSelectMenu() && i.customId === 'shop_buy_select') {
        const fakeInteraction = Object.assign(Object.create(Object.getPrototypeOf(i)), i);
        fakeInteraction.customId = i.values[0];
        await _handleShopButton(fakeInteraction, client, db);
        return;
    }

    if (i.isStringSelectMenu() && i.customId === 'fishing_gear_sub_menu') {
        const val = i.values[0];
        if (val === 'gear_rods') await _handleRodSelect(i, client, db);
        else if (val === 'gear_boats') await _handleBoatSelect(i, client, db);
        else if (val === 'gear_baits') await _handleBaitSelect(i, client, db);
        return;
    }

    if (i.isStringSelectMenu() && i.customId === 'shop_buy_potion_menu') {
        const potionId = i.values[0].replace('buy_item_', '');
        const item = potionItems.find(it => it.id === potionId);
        if (!item) return await i.reply({ content: "❌ خطأ في تحميل بيانات الجرعة.", flags: MessageFlags.Ephemeral });
        await _handleShopButton(i, client, db);
        return;
    }

    if (i.isStringSelectMenu() && i.customId === 'shop_buy_bait_menu') {
        await _handleBaitBuy(i, client, db);
        return;
    }

    if (i.customId.startsWith('buy_item_')) {
        const boughtItemId = i.customId.replace('buy_item_', ''); 
        
        if (boughtItemId === 'fishing_gear_menu') return await _handleFishingMenu(i, client, db);
        if (boughtItemId === 'potions_menu') return await _handlePotionSelect(i, client, db);
        
        if (boughtItemId === 'exchange_xp') {
             const xpModal = new ModalBuilder().setCustomId('exchange_xp_modal').setTitle('شراء خبرة');
             xpModal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('xp_amount_input').setLabel('الكمية (اكتب All للكل)').setStyle(TextInputStyle.Short).setRequired(true)));
             return await i.showModal(xpModal);
        }
        
        if (boughtItemId === 'item_temp_reply') {
            const modal = new ModalBuilder().setCustomId('shop_buy_reply_modal').setTitle('شراء رد تلقائي (3 أيام)');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reply_trigger').setLabel("الكلمة (Trigger)").setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reply_response').setLabel("الرد (Response)").setStyle(TextInputStyle.Paragraph).setRequired(true))
            );
            return await i.showModal(modal);
        }

        await _handleShopButton(i, client, db);
    }
    else if (i.customId.startsWith('replace_buff_')) await _handleReplaceBuffButton(i, client, db);
    else if (i.customId === 'cancel_purchase') { await i.deferUpdate(); await i.editReply({ content: 'تم الإلغاء.', components: [], embeds: [] }); }
    else if (i.customId === 'replace_guard') await _handleReplaceGuard(i, client, db);
}

module.exports = {
    handleShopModal,
    handleShopInteractions
};
