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

    const farmOwnersRes = await db.query(`SELECT DISTINCT "userID", "guildID" FROM user_farm UNION SELECT DISTINCT "userID", "guildID" FROM user_lands`);
    const farmOwners = farmOwnersRes.rows;
    if (!farmOwners.length) return;
    
    for (const owner of farmOwners) {
        try {
            const { userID, guildID } = owner;
            
            const workerBuffRes = await db.query(`SELECT * FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'farm_worker' AND "expiresAt" > $3`, [userID, guildID, now]);
            const hasWorker = workerBuffRes.rows.length > 0;

            // ---------------------------------------------------------
            // 🌾 1. الحصاد التلقائي
            // ---------------------------------------------------------
            if (hasWorker) {
                const plantedPlotsRes = await db.query(`SELECT * FROM user_lands WHERE "userID" = $1 AND "guildID" = $2 AND "status" = 'planted'`, [userID, guildID]);
                const plantedPlots = plantedPlotsRes.rows;
                
                for (const plot of plantedPlots) {
                    const seed = seedsData.find(s => s.id === plot.seedID);
                    if (!seed) continue;

                    const growthMs = seed.growth_time_hours * 3600000;
                    const plantTime = Number(plot.plantTime) || now;
                    const age = now - plantTime;

                    if (age >= growthMs) {
                        await db.query(`UPDATE user_lands SET "status" = 'empty', "seedID" = NULL, "plantTime" = NULL WHERE "userID" = $1 AND "guildID" = $2 AND "plotID" = $3`, [userID, guildID, plot.plotID]);
                        
                        let userData = await client.getLevel(userID, guildID);
                        if (userData) {
                            userData.mora = (Number(userData.mora) || 0) + Number(seed.sell_price);
                            userData.xp = (Number(userData.xp) || 0) + Number(seed.xp_reward);
                            userData.totalXP = (Number(userData.totalXP) || 0) + Number(seed.xp_reward);
                            await client.setLevel(userData);
                        }

                        if (updateGuildStat) {
                            updateGuildStat(client, guildID, userID, 'crops_harvested', seed.sell_price);
                        }

                        await db.query(`INSERT INTO farm_daily_log ("userID", "guildID", "actionType", "itemName", "count", "timestamp") VALUES ($1, $2, $3, $4, $5, $6)`, [userID, guildID, 'harvest', seed.name, 1, now]);
                    }
                }
            }

            // ---------------------------------------------------------
            // 🐄 2. صيانة الحيوانات (العامل + فحص الموت من الكبر)
            // ---------------------------------------------------------
            const userFarmRes = await db.query(`SELECT * FROM user_farm WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
            const userFarm = userFarmRes.rows;
            
            for (const row of userFarm) {
                const animal = farmAnimals.find(a => String(a.id) === String(row.animalID));
                if (!animal) continue; 

                const qty = Number(row.quantity) || 1;
                
                // 🛑 النظام الجديد: متى ينتهي شبع الحيوان؟
                const maxHungerMs = (animal.max_hunger_days || 3) * ONE_DAY; // الافتراضي 3 أيام
                const lastFed = Number(row.lastFedTimestamp) || now;
                const fullUntil = lastFed + maxHungerMs; 
                const timeLeft = fullUntil - now; 

                // 👨‍🌾 تدخل العامل التلقائي إذا نزل الشبع تحت 50%
                if (hasWorker && timeLeft < (maxHungerMs * 0.5)) {
                    const invDataRes = await db.query(`SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [userID, guildID, animal.feed_id]);
                    const invData = invDataRes.rows[0];
                    
                    if (invData && Number(invData.quantity) >= qty) {
                        await db.query(`UPDATE user_inventory SET "quantity" = "quantity" - $1 WHERE "userID" = $2 AND "guildID" = $3 AND "itemID" = $4`, [qty, userID, guildID, animal.feed_id]);
                        await db.query(`UPDATE user_farm SET "lastFedTimestamp" = $1 WHERE "id" = $2`, [now, row.id]);
                        
                        await db.query(`INSERT INTO farm_daily_log ("userID", "guildID", "actionType", "itemName", "count", "timestamp") VALUES ($1, $2, $3, $4, $5, $6)`, [userID, guildID, 'feed', animal.name, qty, now]);
                    } else {
                        const logsRes = await db.query(`SELECT * FROM farm_daily_log WHERE "userID" = $1 AND "guildID" = $2 AND "actionType" = 'out_of_stock'`, [userID, guildID]);
                        const logs = logsRes.rows;
                        const alreadyLogged = logs.some(l => Number(l.timestamp) > (now - ONE_DAY));
                        if (!alreadyLogged) {
                            await db.query(`INSERT INTO farm_daily_log ("userID", "guildID", "actionType", "itemName", "count", "timestamp") VALUES ($1, $2, $3, $4, $5, $6)`, [userID, guildID, 'out_of_stock', 'feed', 1, now]);
                        }
                    }
                }

                // 🍂 الموت من الكبر (الشيخوخة فقط)
                const purchaseTimestamp = Number(row.purchaseTimestamp) || now; 
                const ageInMs = now - purchaseTimestamp;
                const lifespanInMs = animal.lifespan_days * ONE_DAY;

                if (ageInMs >= lifespanInMs) {
                    await db.query(`DELETE FROM user_farm WHERE "id" = $1`, [row.id]);
                    await db.query(`INSERT INTO farm_daily_log ("userID", "guildID", "actionType", "itemName", "count", "timestamp") VALUES ($1, $2, $3, $4, $5, $6)`, [userID, guildID, 'death_old', animal.name, qty, now]);
                }
            }

            // =========================================================
            // 📊 3. التقرير اليومي وتوزيع الدخل (بحسب شرط الـ 12 ساعة)
            // =========================================================
            const payoutID = `${userID}-${guildID}`;
            const lastPayoutDataRes = await db.query(`SELECT "lastPayoutDate" FROM farm_last_payout WHERE "id" = $1`, [payoutID]);
            const lastPayoutData = lastPayoutDataRes.rows[0];
            
            if (lastPayoutData && (now - Number(lastPayoutData.lastPayoutDate)) < ONE_DAY) {
                continue; 
            }

            let dailyAnimalIncome = 0;
            let currentAnimalsCount = 0;
            let hungryAnimalsCount = 0;
            
            const liveAnimalsRes = await db.query(`SELECT * FROM user_farm WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
            const liveAnimals = liveAnimalsRes.rows;
            
            for (const row of liveAnimals) {
                const animal = farmAnimals.find(a => String(a.id) === String(row.animalID));
                if (animal) {
                    const qty = Number(row.quantity) || 1;
                    
                    // حساب مدة الشبع المتبقية
                    const maxHungerMs = (animal.max_hunger_days || 3) * ONE_DAY;
                    const lastFed = Number(row.lastFedTimestamp) || now;
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
                let userData = await client.getLevel(userID, guildID);
                if (userData) {
                    userData.mora = (Number(userData.mora) || 0) + dailyAnimalIncome;
                    await client.setLevel(userData);
                }
            }

            const dailyLogsRes = await db.query(`SELECT * FROM farm_daily_log WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);
            const dailyLogs = dailyLogsRes.rows;
            
            let harvestedMap = new Map();
            let fedMap = new Map();
            let oldDeaths = [];
            let outOfStock = false;

            for (const log of dailyLogs) {
                const logCount = Number(log.count) || 1;
                if (log.actionType === 'harvest') {
                    harvestedMap.set(log.itemName, (harvestedMap.get(log.itemName) || 0) + logCount);
                } else if (log.actionType === 'feed') {
                    fedMap.set(log.itemName, (fedMap.get(log.itemName) || 0) + logCount);
                } else if (log.actionType === 'death_old') {
                    if (!oldDeaths.includes(log.itemName)) oldDeaths.push(log.itemName);
                } else if (log.actionType === 'out_of_stock') {
                    outOfStock = true;
                }
            }

            await db.query(`DELETE FROM farm_daily_log WHERE "userID" = $1 AND "guildID" = $2`, [userID, guildID]);

            // إذا لم يكن هناك دخل ولا أحداث، سجل الدفع وتخطى لإراحة البوت
            if (dailyAnimalIncome <= 0 && dailyLogs.length === 0 && hungryAnimalsCount === 0) {
                await db.query(`INSERT INTO farm_last_payout ("id", "lastPayoutDate") VALUES ($1, $2) ON CONFLICT("id") DO UPDATE SET "lastPayoutDate" = $3`, [payoutID, now, now]); 
                continue;
            }

            const guildObj = client.guilds.cache.get(guildID);
            if (!guildObj) continue;
            
            const settingsRes = await db.query(`SELECT "casinoChannelID" FROM settings WHERE "guild" = $1`, [guildID]);
            const settings = settingsRes.rows[0];
            
            if (!settings || !settings.casinoChannelID) continue;
            const channel = guildObj.channels.cache.get(settings.casinoChannelID);
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

            // 🔥 تنبيه للحيوانات الجائعة التي لم تنتج مورا
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

            await db.query(`INSERT INTO farm_last_payout ("id", "lastPayoutDate") VALUES ($1, $2) ON CONFLICT("id") DO UPDATE SET "lastPayoutDate" = $3`, [payoutID, now, now]);

        } catch (err) {
            console.error(`[Farm Critical Error] User: ${owner.userID}`, err);
        }
    }
}

module.exports = { checkFarmIncome };
