const { EmbedBuilder, Colors } = require("discord.js");
const farmAnimals = require('../json/farm-animals.json');
const seedsData = require('../json/seeds.json'); 
const feedItems = require('../json/feed-items.json');

let updateGuildStat;
try {
    ({ updateGuildStat } = require('./guild-board-handler.js'));
} catch (e) {}

async function checkFarmIncome(client, db) {
    if (!db) return;

    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const TWELVE_HOURS = 12 * 60 * 60 * 1000; // 🔥 شرط الـ 12 ساعة الجديد

    try {
        await db.query(`CREATE TABLE IF NOT EXISTS farm_last_payout ("id" TEXT PRIMARY KEY, "lastPayoutDate" BIGINT)`);
        await db.query(`CREATE TABLE IF NOT EXISTS farm_daily_log ("id" BIGSERIAL PRIMARY KEY, "userID" TEXT, "guildID" TEXT, "actionType" TEXT, "itemName" TEXT, "count" BIGINT, "timestamp" BIGINT)`);
    } catch (e) {
        console.error("Error creating farm tables:", e);
    }

    let farmOwnersRes;
    try {
        farmOwnersRes = await db.query(`SELECT DISTINCT "userID", "guildID" FROM user_farm UNION SELECT DISTINCT "userID", "guildID" FROM user_lands`);
    } catch(e) {
        farmOwnersRes = await db.query(`SELECT DISTINCT userid as "userID", guildid as "guildID" FROM user_farm UNION SELECT DISTINCT userid as "userID", guildid as "guildID" FROM user_lands`).catch(()=>({rows:[]}));
    }
    
    const farmOwners = farmOwnersRes.rows;
    if (!farmOwners.length) return;
    
    for (const owner of farmOwners) {
        try {
            const { userID, guildID } = owner;
            if (!userID || !guildID) continue;
            
            let workerBuffRes;
            try { workerBuffRes = await db.query(`SELECT * FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'farm_worker' AND "expiresAt" > $3`, [userID, guildID, now]); }
            catch(e) { workerBuffRes = await db.query(`SELECT * FROM user_buffs WHERE userid = $1 AND guildid = $2 AND bufftype = 'farm_worker' AND expiresat > $3`, [userID, guildID, now]).catch(()=>({rows:[]})); }
            
            const hasWorker = workerBuffRes.rows.length > 0;

            // ---------------------------------------------------------
            // 🌾 1. الحصاد التلقائي
            // ---------------------------------------------------------
            if (hasWorker) {
                let plantedPlotsRes;
                try { plantedPlotsRes = await db.query(`SELECT * FROM user_lands WHERE "userID" = $1 AND "guildID" = $2 AND "status" = 'planted'`, [userID, guildID]); }
                catch(e) { plantedPlotsRes = await db.query(`SELECT * FROM user_lands WHERE userid = $1 AND guildid = $2 AND status = 'planted'`, [userID, guildID]).catch(()=>({rows:[]})); }
                
                const plantedPlots = plantedPlotsRes.rows;
                
                for (const plot of plantedPlots) {
                    const seedId = plot.seedID || plot.seedid;
                    const seed = seedsData.find(s => String(s.id) === String(seedId));
                    if (!seed) continue;

                    const growthMs = seed.growth_time_hours * 3600000;
                    const plantTime = Number(plot.plantTime || plot.planttime) || now;
                    const age = now - plantTime;

                    if (age >= growthMs) {
                        try { await db.query(`UPDATE user_lands SET "status" = 'empty', "seedID" = NULL, "plantTime" = NULL WHERE "userID" = $1 AND "guildID" = $2 AND "plotID" = $3`, [userID, guildID, plot.plotID || plot.plotid]); }
                        catch(e) { await db.query(`UPDATE user_lands SET status = 'empty', seedid = NULL, planttime = NULL WHERE userid = $1 AND guildid = $2 AND plotid = $3`, [userID, guildID, plot.plotID || plot.plotid]).catch(()=>{}); }
                        
                        // 🔥 تحديث المورا والـ XP بقوة للذاكرة وقاعدة البيانات لمنع القلتش 🔥
                        let userData = await client.getLevel(userID, guildID);
                        if (!userData) userData = { ...client.defaultData, user: userID, guild: guildID };
                        
                        const extraMora = Number(seed.sell_price) || 0;
                        const extraXp = Number(seed.xp_reward) || 0;
                        
                        userData.mora = String(Number(userData.mora || 0) + extraMora);
                        userData.xp = String(Number(userData.xp || 0) + extraXp);
                        userData.totalXP = String(Number(userData.totalXP || userData.totalxp || 0) + extraXp);
                        
                        try { await db.query(`UPDATE levels SET "mora" = "mora" + $1, "xp" = "xp" + $2, "totalXP" = "totalXP" + $2 WHERE "user" = $3 AND "guild" = $4`, [extraMora, extraXp, userID, guildID]); }
                        catch(e) { await db.query(`UPDATE levels SET mora = mora + $1, xp = xp + $2, totalxp = COALESCE(totalxp, 0) + $2 WHERE userid = $3 AND guildid = $4`, [extraMora, extraXp, userID, guildID]).catch(()=>{}); }

                        if (typeof client.setLevel === 'function') await client.setLevel(userData);

                        if (updateGuildStat) {
                            updateGuildStat(client, guildID, userID, 'crops_harvested', seed.sell_price);
                        }

                        try { await db.query(`INSERT INTO farm_daily_log ("userID", "guildID", "actionType", "itemName", "count", "timestamp") VALUES ($1, $2, $3, $4, $5, $6)`, [userID, guildID, 'harvest', seed.name, 1, now]); }
                        catch(e) { await db.query(`INSERT INTO farm_daily_log (userid, guildid, actiontype, itemname, count, timestamp) VALUES ($1, $2, $3, $4, $5, $6)`, [userID, guildID, 'harvest', seed.name, 1, now]).catch(()=>{}); }
                    }
                }
            }

            // ---------------------------------------------------------
            // 🐄 2. صيانة الحيوانات (العامل + فحص الموت من الكبر)
            // ---------------------------------------------------------
            let userFarmRes;
            try { userFarmRes = await db.query(`SELECT * FROM user_farm WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]); }
            catch(e) { userFarmRes = await db.query(`SELECT * FROM user_farm WHERE userid = $1 AND guildid = $2`, [userID, guildID]).catch(()=>({rows:[]})); }
            const userFarm = userFarmRes.rows;
            
            for (const row of userFarm) {
                const animalId = row.animalID || row.animalid;
                const animal = farmAnimals.find(a => String(a.id) === String(animalId));
                if (!animal) continue; 

                const qty = Number(row.quantity) || 1;
                
                // 🛑 النظام الجديد: متى ينتهي شبع الحيوان؟
                const maxHungerMs = (animal.max_hunger_days || 3) * ONE_DAY; // الافتراضي 3 أيام
                const lastFed = Number(row.lastFedTimestamp || row.lastfedtimestamp) || now;
                const fullUntil = lastFed + maxHungerMs; 
                const timeLeft = fullUntil - now; 

                // 👨‍🌾 تدخل العامل التلقائي إذا نزل الشبع تحت 50%
                if (hasWorker && timeLeft < (maxHungerMs * 0.5)) {
                    let invDataRes;
                    try { invDataRes = await db.query(`SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [userID, guildID, animal.feed_id]); }
                    catch(e) { invDataRes = await db.query(`SELECT quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [userID, guildID, animal.feed_id]).catch(()=>({rows:[]})); }
                    const invData = invDataRes.rows[0];
                    
                    if (invData && Number(invData.quantity) >= qty) {
                        try {
                            await db.query(`UPDATE user_inventory SET "quantity" = "quantity" - $1 WHERE "userID" = $2 AND "guildID" = $3 AND "itemID" = $4`, [qty, userID, guildID, animal.feed_id]);
                            await db.query(`UPDATE user_farm SET "lastFedTimestamp" = $1 WHERE "id" = $2`, [now, row.id]);
                            await db.query(`INSERT INTO farm_daily_log ("userID", "guildID", "actionType", "itemName", "count", "timestamp") VALUES ($1, $2, $3, $4, $5, $6)`, [userID, guildID, 'feed', animal.name, qty, now]);
                        } catch(e) {
                            await db.query(`UPDATE user_inventory SET quantity = quantity - $1 WHERE userid = $2 AND guildid = $3 AND itemid = $4`, [qty, userID, guildID, animal.feed_id]).catch(()=>{});
                            await db.query(`UPDATE user_farm SET lastfedtimestamp = $1 WHERE id = $2`, [now, row.id]).catch(()=>{});
                            await db.query(`INSERT INTO farm_daily_log (userid, guildid, actiontype, itemname, count, timestamp) VALUES ($1, $2, $3, $4, $5, $6)`, [userID, guildID, 'feed', animal.name, qty, now]).catch(()=>{});
                        }
                    } else {
                        let logsRes;
                        try { logsRes = await db.query(`SELECT * FROM farm_daily_log WHERE "userID" = $1 AND "guildID" = $2 AND "actionType" = 'out_of_stock'`, [userID, guildID]); }
                        catch(e) { logsRes = await db.query(`SELECT * FROM farm_daily_log WHERE userid = $1 AND guildid = $2 AND actiontype = 'out_of_stock'`, [userID, guildID]).catch(()=>({rows:[]})); }
                        const logs = logsRes.rows;
                        const alreadyLogged = logs.some(l => Number(l.timestamp) > (now - ONE_DAY));
                        if (!alreadyLogged) {
                            try { await db.query(`INSERT INTO farm_daily_log ("userID", "guildID", "actionType", "itemName", "count", "timestamp") VALUES ($1, $2, $3, $4, $5, $6)`, [userID, guildID, 'out_of_stock', 'feed', 1, now]); }
                            catch(e) { await db.query(`INSERT INTO farm_daily_log (userid, guildid, actiontype, itemname, count, timestamp) VALUES ($1, $2, $3, $4, $5, $6)`, [userID, guildID, 'out_of_stock', 'feed', 1, now]).catch(()=>{}); }
                        }
                    }
                }

                // 🍂 الموت من الكبر (الشيخوخة فقط)
                const purchaseTimestamp = Number(row.purchaseTimestamp || row.purchasetimestamp) || now; 
                const ageInMs = now - purchaseTimestamp;
                const lifespanInMs = animal.lifespan_days * ONE_DAY;

                if (ageInMs >= lifespanInMs) {
                    try {
                        await db.query(`DELETE FROM user_farm WHERE "id" = $1`, [row.id]);
                        await db.query(`INSERT INTO farm_daily_log ("userID", "guildID", "actionType", "itemName", "count", "timestamp") VALUES ($1, $2, $3, $4, $5, $6)`, [userID, guildID, 'death_old', animal.name, qty, now]);
                    } catch(e) {
                        await db.query(`DELETE FROM user_farm WHERE id = $1`, [row.id]).catch(()=>{});
                        await db.query(`INSERT INTO farm_daily_log (userid, guildid, actiontype, itemname, count, timestamp) VALUES ($1, $2, $3, $4, $5, $6)`, [userID, guildID, 'death_old', animal.name, qty, now]).catch(()=>{});
                    }
                }
            }

            // =========================================================
            // 📊 3. التقرير اليومي وتوزيع الدخل (بحسب شرط الـ 12 ساعة)
            // =========================================================
            const payoutID = `${userID}-${guildID}`;
            let lastPayoutDataRes;
            try { lastPayoutDataRes = await db.query(`SELECT "lastPayoutDate" FROM farm_last_payout WHERE "id" = $1`, [payoutID]); }
            catch(e) { lastPayoutDataRes = await db.query(`SELECT lastpayoutdate FROM farm_last_payout WHERE id = $1`, [payoutID]).catch(()=>({rows:[]})); }
            const lastPayoutData = lastPayoutDataRes.rows[0];
            
            const payoutTime = lastPayoutData ? (Number(lastPayoutData.lastPayoutDate || lastPayoutData.lastpayoutdate) || 0) : 0;
            if (payoutTime > 0 && (now - payoutTime) < ONE_DAY) {
                continue; 
            }

            let dailyAnimalIncome = 0;
            let currentAnimalsCount = 0;
            let hungryAnimalsCount = 0;
            
            let liveAnimalsRes;
            try { liveAnimalsRes = await db.query(`SELECT * FROM user_farm WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]); }
            catch(e) { liveAnimalsRes = await db.query(`SELECT * FROM user_farm WHERE userid = $1 AND guildid = $2`, [userID, guildID]).catch(()=>({rows:[]})); }
            const liveAnimals = liveAnimalsRes.rows;
            
            for (const row of liveAnimals) {
                const animalId = row.animalID || row.animalid;
                const animal = farmAnimals.find(a => String(a.id) === String(animalId));
                if (animal) {
                    const qty = Number(row.quantity) || 1;
                    
                    // حساب مدة الشبع المتبقية
                    const maxHungerMs = (animal.max_hunger_days || 3) * ONE_DAY;
                    const lastFed = Number(row.lastFedTimestamp || row.lastfedtimestamp) || now;
                    const fullUntil = lastFed + maxHungerMs; 
                    const timeLeft = fullUntil - now; 

                    // 🔥 شرط الـ 12 ساعة للدخل
                    if (timeLeft >= TWELVE_HOURS) {
                        dailyAnimalIncome += (Number(animal.income_per_day) * qty);
                    } else {
                        hungryAnimalsCount += qty; // هؤلاء لم ينتجوا شيئاً بسبب الجوع
                    }
                    
                    currentAnimalsCount += qty;
                }
            }

            if (dailyAnimalIncome > 0) {
                // 🔥 تحديث المورا للدخل اليومي بقوة لضمان عدم القلتش 🔥
                let userData = await client.getLevel(userID, guildID);
                if (!userData) userData = { ...client.defaultData, user: userID, guild: guildID };
                
                userData.mora = String(Number(userData.mora || 0) + dailyAnimalIncome);
                
                try { await db.query(`UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3`, [dailyAnimalIncome, userID, guildID]); }
                catch(e) { await db.query(`UPDATE levels SET mora = mora + $1 WHERE userid = $2 AND guildid = $3`, [dailyAnimalIncome, userID, guildID]).catch(()=>{}); }

                if (typeof client.setLevel === 'function') await client.setLevel(userData);
            }

            let dailyLogsRes;
            try { dailyLogsRes = await db.query(`SELECT * FROM farm_daily_log WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]); }
            catch(e) { dailyLogsRes = await db.query(`SELECT * FROM farm_daily_log WHERE userid = $1 AND guildid = $2`, [userID, guildID]).catch(()=>({rows:[]})); }
            const dailyLogs = dailyLogsRes.rows;
            
            let harvestedMap = new Map();
            let fedMap = new Map();
            let oldDeaths = [];
            let outOfStock = false;

            for (const log of dailyLogs) {
                const logCount = Number(log.count) || 1;
                const aType = log.actionType || log.actiontype;
                const iName = log.itemName || log.itemname;
                if (aType === 'harvest') {
                    harvestedMap.set(iName, (harvestedMap.get(iName) || 0) + logCount);
                } else if (aType === 'feed') {
                    fedMap.set(iName, (fedMap.get(iName) || 0) + logCount);
                } else if (aType === 'death_old') {
                    if (!oldDeaths.includes(iName)) oldDeaths.push(iName);
                } else if (aType === 'out_of_stock') {
                    outOfStock = true;
                }
            }

            try { await db.query(`DELETE FROM farm_daily_log WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]); }
            catch(e) { await db.query(`DELETE FROM farm_daily_log WHERE userid = $1 AND guildid = $2`, [userID, guildID]).catch(()=>{}); }

            // إذا لم يكن هناك دخل ولا أحداث، سجل الدفع وتخطى لإراحة البوت
            if (dailyAnimalIncome <= 0 && dailyLogs.length === 0 && hungryAnimalsCount === 0) {
                try { await db.query(`INSERT INTO farm_last_payout ("id", "lastPayoutDate") VALUES ($1, $2) ON CONFLICT("id") DO UPDATE SET "lastPayoutDate" = $3`, [payoutID, now, now]); }
                catch(e) { await db.query(`INSERT INTO farm_last_payout (id, lastpayoutdate) VALUES ($1, $2) ON CONFLICT(id) DO UPDATE SET lastpayoutdate = $3`, [payoutID, now, now]).catch(()=>{}); }
                continue;
            }

            const guildObj = client.guilds.cache.get(guildID);
            if (!guildObj) continue;
            
            let settingsRes;
            try { settingsRes = await db.query(`SELECT "casinoChannelID" FROM settings WHERE "guild" = $1`, [guildID]); }
            catch(e) { settingsRes = await db.query(`SELECT casinochannelid FROM settings WHERE guild = $1`, [guildID]).catch(()=>({rows:[]})); }
            const settings = settingsRes.rows[0];
            
            const casinoId = settings ? (settings.casinoChannelID || settings.casinochannelid) : null;
            if (!casinoId) continue;
            
            const channel = guildObj.channels.cache.get(casinoId);
            if (!channel) continue;
            
            const member = await guildObj.members.fetch(userID).catch(() => null);
            if (!member) continue; 

            const EMOJI_MORA = '<:mora:1435647151349698621>'; 
            let description = ``;

            if (hasWorker && (fedMap.size > 0 || harvestedMap.size > 0 || outOfStock)) {
                description += `**✶تـقـرير عـامل المزرعـة**\n\n`;
                
                if (fedMap.size > 0) {
                    description += `**★ تـم اطعـام:**\n`;
                    fedMap.forEach((count, name) => description += `- ${name}: ${count}\n`);
                    description += `\n`;
                }

                if (outOfStock) {
                    description += `**★ ⚠️ تنبيه:** مخزون الأعلاف نفد! العامل لم يستطع إطعام الجميع.\n\n`;
                }

                if (harvestedMap.size > 0) {
                    description += `**★ تـم حصـاد:**\n`;
                    harvestedMap.forEach((count, name) => description += `- ${name}: ${count}\n`);
                    description += `\n`;
                }
                description += `────────────────────\n`;
            }

            description += `✶ حـققـت حيواناتك دخـل يومي بقيمـة: **${dailyAnimalIncome.toLocaleString()}** ${EMOJI_MORA}\n` +
                           `✶ عـدد الحـيوانات الحية في مزرعتك: **${currentAnimalsCount.toLocaleString()}**`;

            if (hungryAnimalsCount > 0) {
                description += `\n\n⚠️ تنبـيه:${hungryAnimalsCount} من حيواناتك جائـعة - اطعمهم ليعود الانتـاج`;
            }

            if (oldDeaths.length > 0) {
                description += `\n\n💀 **سُنة الحياة في المزرعة...**\n`;
                description += `🍂 **مات من الكبر:** ${oldDeaths.join('، ')}\n`;
            }

            const embed = new EmbedBuilder()
                .setTitle(`❖ تـقرير المـزرعـة اليومي`)
                .setColor("Random")
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setImage('https://i.postimg.cc/sD3FWvWT/2755e200-2fc8-45e1-8f3f-785b8e19793d-(1).png')
                .setDescription(description)
                .setTimestamp();

            await channel.send({ content: `<@${userID}>`, embeds: [embed] }).catch(() => {});

            try { await db.query(`INSERT INTO farm_last_payout ("id", "lastPayoutDate") VALUES ($1, $2) ON CONFLICT("id") DO UPDATE SET "lastPayoutDate" = $3`, [payoutID, now, now]); }
            catch(e) { await db.query(`INSERT INTO farm_last_payout (id, lastpayoutdate) VALUES ($1, $2) ON CONFLICT(id) DO UPDATE SET lastpayoutdate = $3`, [payoutID, now, now]).catch(()=>{}); }

        } catch (err) {
            console.error(`[Farm Critical Error] User: ${owner.userID}`, err);
        }
    }
}

module.exports = { checkFarmIncome };
