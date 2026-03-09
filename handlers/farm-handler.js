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
    const ONE_HOUR = 60 * 60 * 1000;
    const ONE_DAY = 24 * 60 * 60 * 1000;

    try {
        await db.query("CREATE TABLE IF NOT EXISTS farm_last_payout (id TEXT PRIMARY KEY, lastpayoutdate BIGINT)");
        await db.query("CREATE TABLE IF NOT EXISTS farm_daily_log (id SERIAL PRIMARY KEY, userid TEXT, guildid TEXT, actiontype TEXT, itemname TEXT, count INTEGER, timestamp BIGINT)");
    } catch (e) {
        console.error("Error creating farm tables:", e);
    }

    const farmOwnersRes = await db.query("SELECT DISTINCT userid, guildid FROM user_farm UNION SELECT DISTINCT userid, guildid FROM user_lands");
    const farmOwners = farmOwnersRes.rows;
    
    if (!farmOwners.length) return;
    
    for (const owner of farmOwners) {
        try {
            const { userid: userID, guildid: guildID } = owner;
            
            const workerBuffRes = await db.query("SELECT * FROM user_buffs WHERE userid = $1 AND guildid = $2 AND bufftype = 'farm_worker' AND expiresat > $3", [userID, guildID, now]);
            const hasWorker = workerBuffRes.rows.length > 0;

            if (hasWorker) {
                const plantedPlotsRes = await db.query("SELECT * FROM user_lands WHERE userid = $1 AND guildid = $2 AND status = 'planted'", [userID, guildID]);
                const plantedPlots = plantedPlotsRes.rows;
                
                for (const plot of plantedPlots) {
                    const seed = seedsData.find(s => s.id === plot.seedid);
                    if (!seed) continue;

                    const growthMs = seed.growth_time_hours * 3600000;
                    const plantTime = parseInt(plot.planttime) || now;
                    const age = now - plantTime;

                    if (age >= growthMs) {
                        await db.query("UPDATE user_lands SET status = 'empty', seedid = NULL, planttime = NULL WHERE userid = $1 AND guildid = $2 AND plotid = $3", [userID, guildID, plot.plotid]);
                        
                        // 🔥 تم التعديل هنا: استخدام "user" و guild بدلاً من userid و guildid
                        let userDataRes = await db.query('SELECT * FROM levels WHERE "user" = $1 AND guild = $2', [userID, guildID]);
                        let userData = userDataRes.rows[0];
                        if (userData) {
                            userData.mora = (parseInt(userData.mora) || 0) + seed.sell_price;
                            userData.xp = (parseInt(userData.xp) || 0) + seed.xp_reward;
                            userData.totalxp = (parseInt(userData.totalxp) || 0) + seed.xp_reward;
                            // 🔥 وتم التعديل هنا أيضاً
                            await db.query('UPDATE levels SET mora = $1, xp = $2, totalxp = $3 WHERE "user" = $4 AND guild = $5', [userData.mora, userData.xp, userData.totalxp, userID, guildID]);
                        }

                        if (updateGuildStat) {
                            updateGuildStat(client, guildID, userID, 'crops_harvested', seed.sell_price);
                        }

                        await db.query("INSERT INTO farm_daily_log (userid, guildid, actiontype, itemname, count, timestamp) VALUES ($1, $2, $3, $4, $5, $6)", [userID, guildID, 'harvest', seed.name, 1, now]);
                    }
                }
            }

            const userFarmRes = await db.query("SELECT * FROM user_farm WHERE userid = $1 AND guildid = $2", [userID, guildID]);
            const userFarm = userFarmRes.rows;
            
            for (const row of userFarm) {
                const animal = farmAnimals.find(a => String(a.id) === String(row.animalid));
                if (!animal) continue; 

                const qty = row.quantity || 1;
                const lastFed = parseInt(row.lastfedtimestamp) || now;
                const hungerTime = now - lastFed;
                const maxHungerMs = (animal.max_hunger_days || 7) * ONE_DAY;
                
                const hungerThreshold = maxHungerMs * 0.9; 

                let fedToday = false;

                if (hungerTime >= hungerThreshold) {
                    if (hasWorker) {
                        const invDataRes = await db.query("SELECT quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3", [userID, guildID, animal.feed_id]);
                        const invData = invDataRes.rows[0];
                        
                        if (invData && invData.quantity >= qty) {
                            await db.query("UPDATE user_inventory SET quantity = quantity - $1 WHERE userid = $2 AND guildid = $3 AND itemid = $4", [qty, userID, guildID, animal.feed_id]);
                            await db.query("UPDATE user_farm SET lastfedtimestamp = $1 WHERE id = $2", [now, row.id]);
                            
                            await db.query("INSERT INTO farm_daily_log (userid, guildid, actiontype, itemname, count, timestamp) VALUES ($1, $2, $3, $4, $5, $6)", [userID, guildID, 'feed', animal.name, qty, now]);
                            fedToday = true;
                        } else {
                            const logsRes = await db.query("SELECT * FROM farm_daily_log WHERE userid = $1 AND guildid = $2", [userID, guildID]);
                            const logs = logsRes.rows;
                            const alreadyLogged = logs.some(l => l.actiontype === 'out_of_stock' && parseInt(l.timestamp) > (now - ONE_DAY));
                            if (!alreadyLogged) {
                                await db.query("INSERT INTO farm_daily_log (userid, guildid, actiontype, itemname, count, timestamp) VALUES ($1, $2, $3, $4, $5, $6)", [userID, guildID, 'out_of_stock', 'feed', 1, now]);
                            }
                        }
                    }
                }

                const purchaseTimestamp = parseInt(row.purchasetimestamp) || now; 
                const ageInMs = now - purchaseTimestamp;
                const lifespanInMs = animal.lifespan_days * ONE_DAY;

                if (!fedToday && hungerTime >= maxHungerMs) {
                    await db.query("DELETE FROM user_farm WHERE id = $1", [row.id]);
                    await db.query("INSERT INTO farm_daily_log (userid, guildid, actiontype, itemname, count, timestamp) VALUES ($1, $2, $3, $4, $5, $6)", [userID, guildID, 'death_starve', animal.name, qty, now]);
                } else if (ageInMs >= lifespanInMs) {
                    await db.query("DELETE FROM user_farm WHERE id = $1", [row.id]);
                    await db.query("INSERT INTO farm_daily_log (userid, guildid, actiontype, itemname, count, timestamp) VALUES ($1, $2, $3, $4, $5, $6)", [userID, guildID, 'death_old', animal.name, qty, now]);
                }
            }

            const payoutID = `${userID}-${guildID}`;
            const lastPayoutDataRes = await db.query("SELECT lastpayoutdate FROM farm_last_payout WHERE id = $1", [payoutID]);
            const lastPayoutData = lastPayoutDataRes.rows[0];
            
            if (lastPayoutData && (now - parseInt(lastPayoutData.lastpayoutdate)) < ONE_DAY) {
                continue; 
            }

            let dailyAnimalIncome = 0;
            let currentAnimalsCount = 0;
            
            const liveAnimalsRes = await db.query("SELECT * FROM user_farm WHERE userid = $1 AND guildid = $2", [userID, guildID]);
            const liveAnimals = liveAnimalsRes.rows;
            
            for (const row of liveAnimals) {
                const animal = farmAnimals.find(a => String(a.id) === String(row.animalid));
                if (animal) {
                    const qty = row.quantity || 1;
                    dailyAnimalIncome += (animal.income_per_day * qty);
                    currentAnimalsCount += qty;
                }
            }

            if (dailyAnimalIncome > 0) {
                // 🔥 تم التعديل هنا
                let userDataRes = await db.query('SELECT * FROM levels WHERE "user" = $1 AND guild = $2', [userID, guildID]);
                let userData = userDataRes.rows[0];
                if (userData) {
                    userData.mora = (parseInt(userData.mora) || 0) + dailyAnimalIncome;
                    // 🔥 وتم التعديل هنا أيضاً
                    await db.query('UPDATE levels SET mora = $1 WHERE "user" = $2 AND guild = $3', [userData.mora, userID, guildID]);
                }
            }

            const dailyLogsRes = await db.query("SELECT * FROM farm_daily_log WHERE userid = $1 AND guildid = $2", [userID, guildID]);
            const dailyLogs = dailyLogsRes.rows;
            
            let harvestedMap = new Map();
            let fedMap = new Map();
            let starvedDeaths = [];
            let oldDeaths = [];
            let outOfStock = false;

            for (const log of dailyLogs) {
                if (log.actiontype === 'harvest') {
                    harvestedMap.set(log.itemname, (harvestedMap.get(log.itemname) || 0) + log.count);
                } else if (log.actiontype === 'feed') {
                    fedMap.set(log.itemname, (fedMap.get(log.itemname) || 0) + log.count);
                } else if (log.actiontype === 'death_starve') {
                    if (!starvedDeaths.includes(log.itemname)) starvedDeaths.push(log.itemname);
                } else if (log.actiontype === 'death_old') {
                    if (!oldDeaths.includes(log.itemname)) oldDeaths.push(log.itemname);
                } else if (log.actiontype === 'out_of_stock') {
                    outOfStock = true;
                }
            }

            await db.query("DELETE FROM farm_daily_log WHERE userid = $1 AND guildid = $2", [userID, guildID]);

            if (dailyAnimalIncome <= 0 && dailyLogs.length === 0) {
                await db.query("INSERT INTO farm_last_payout (id, lastpayoutdate) VALUES ($1, $2) ON CONFLICT(id) DO UPDATE SET lastpayoutdate = EXCLUDED.lastpayoutdate", [payoutID, now]); 
                continue;
            }

            const guildObj = client.guilds.cache.get(guildID);
            if (!guildObj) continue;
            
            const settingsRes = await db.query("SELECT casinochannelid FROM settings WHERE guild = $1", [guildID]);
            const settings = settingsRes.rows[0];
            
            if (!settings || !settings.casinochannelid) continue;
            const channel = guildObj.channels.cache.get(settings.casinochannelid);
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

            if (starvedDeaths.length > 0 || oldDeaths.length > 0) {
                description += `\n\n💀 **سُنة الحياة في المزرعة...**\n`;
                if (starvedDeaths.length > 0) description += `❌ **مات من الجوع:** ${starvedDeaths.join('، ')}\n`;
                if (oldDeaths.length > 0) description += `🍂 **مات من الكبر:** ${oldDeaths.join('، ')}\n`;
            }

            const embed = new EmbedBuilder()
                .setTitle(`❖ تـقرير المـزرعـة اليومي`)
                .setColor("Random")
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setImage('https://i.postimg.cc/sD3FWvWT/2755e200-2fc8-45e1-8f3f-785b8e19793d-(1).png')
                .setDescription(description)
                .setTimestamp();

            await channel.send({ content: `<@${userID}>`, embeds: [embed] }).catch(() => {});

            await db.query("INSERT INTO farm_last_payout (id, lastpayoutdate) VALUES ($1, $2) ON CONFLICT(id) DO UPDATE SET lastpayoutdate = EXCLUDED.lastpayoutdate", [payoutID, now]);

        } catch (err) {
            console.error(`[Farm Critical Error] User: ${owner.userid}`, err);
        }
    }
}

module.exports = { checkFarmIncome };
