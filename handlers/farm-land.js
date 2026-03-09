const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder, Colors } = require("discord.js");
const Canvas = require('canvas');
const path = require('path');
const seedsData = require('../json/seeds.json');
const { getLandPlots } = require('../utils/farmUtils.js');

let sendLevelUpMessage;
let updateGuildStat;
try {
    ({ sendLevelUpMessage } = require('./handler-utils.js')); 
    ({ updateGuildStat } = require('./guild-board-handler.js'));
} catch (e) {
    try { 
        ({ sendLevelUpMessage } = require('../handlers/handler-utils.js')); 
        ({ updateGuildStat } = require('../handlers/guild-board-handler.js'));
    } catch (e2) {}
}

const EMOJI_MORA = '<:mora:1435647151349698621>';
const PLOW_COST_BULK = 10; 

const TILE_SIZE = 64;   
const GRID_COLS = 6;    
const GRID_ROWS = 6;    
const MAX_GAME_PLOTS = 36; 

const ASSETS_PATH = path.join(__dirname, '..', 'images', 'farm');
let GLOBAL_IMAGES = null;

async function loadAllImages() {
    if (GLOBAL_IMAGES) return GLOBAL_IMAGES; 

    const loadImage = async (name) => {
        try { return await Canvas.loadImage(path.join(ASSETS_PATH, name)); } 
        catch (e) { 
            try { return await Canvas.loadImage(path.join(ASSETS_PATH, name + '.png')); } catch (e2) { return null; }
        }
    };

    GLOBAL_IMAGES = {
        grass: await loadImage('grass.png'),
        tilled: await loadImage('tilled.png'),
        lock: await loadImage('lock.png'),
        withered: await loadImage('withered.png'),
        sprout: await loadImage('sprout.png'),
        borderTop: await loadImage('border_top.png'),
        borderBottom: await loadImage('border_bottom.png'),
        borderLeft: await loadImage('border_left.png'),
        borderRight: await loadImage('border_right.png'),
        cornerTL: await loadImage('corner_top_left.png'),
        cornerTR: await loadImage('corner_top_right.png'),
        cornerBL: await loadImage('corner_bottom_left.png'),
        cornerBR: await loadImage('corner_bottom_right.png'),
        crops: {} 
    };
    return GLOBAL_IMAGES;
}

async function getCropImage(seedId) {
    if (!GLOBAL_IMAGES) await loadAllImages();
    if (GLOBAL_IMAGES.crops[seedId]) return GLOBAL_IMAGES.crops[seedId];

    try {
        const img = await Canvas.loadImage(path.join(ASSETS_PATH, `${seedId}.png`));
        GLOBAL_IMAGES.crops[seedId] = img;
        return img;
    } catch (e) { return null; }
}

async function ensureLandTable(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS user_lands (
            userid TEXT,
            guildid TEXT,
            plotid INTEGER,
            status TEXT, 
            seedid TEXT,
            planttime BIGINT,
            PRIMARY KEY (userid, guildid, plotid)
        )
    `);
}

async function getGrowthMultiplier(member, guildId, db) {
    try {
        const settingsRes = await db.query("SELECT rolefarmking FROM settings WHERE guild = $1", [guildId]);
        const settings = settingsRes.rows[0];
        if (settings && settings.rolefarmking && member && member.roles && member.roles.cache.has(settings.rolefarmking)) {
            return 0.70; 
        }
    } catch(e) {}
    return 1.0;
}

async function renderLand(interaction, client, db) {
    await ensureLandTable(db);
    
    const images = await loadAllImages();

    const user = interaction.user || interaction.author; 
    const userId = user.id;
    const guildId = interaction.guild.id;
    
    let unlockedPlots = await getLandPlots(client, userId, guildId);
    if (unlockedPlots >= 30) unlockedPlots = 36; 

    // جلب بيانات الأراضي
    const userPlotsRes = await db.query("SELECT * FROM user_lands WHERE userid = $1 AND guildid = $2", [userId, guildId]);
    const userPlots = userPlotsRes.rows;
    const now = Date.now();

    const member = interaction.member || await interaction.guild.members.fetch(userId).catch(()=>null);
    const growthMultiplier = await getGrowthMultiplier(member, guildId, db);

    let canPlow = false;        
    let hasTilled = false;      
    let readyCount = 0;         
    let witheredCount = 0;      
    let minRemainingTime = Infinity;
    let totalPlowCost = 0;

    for (let i = 1; i <= unlockedPlots; i++) {
        // التأكد من المساواة بغض النظر عن النوع
        const p = userPlots.find(x => parseInt(x.plotid) === i);
        
        if (!p || p.status === 'empty') {
            totalPlowCost += PLOW_COST_BULK;
            canPlow = true;
        }
        
        if (p && p.status === 'tilled') {
            hasTilled = true;
        }

        if (p && p.status === 'planted' && p.seedid) {
            const seed = seedsData.find(s => s.id === p.seedid);
            if (seed) {
                const growthMs = (seed.growth_time_hours * 3600000) * growthMultiplier;
                const age = now - parseInt(p.planttime);
                const remaining = growthMs - age;

                if (remaining > 0 && remaining < minRemainingTime) {
                    minRemainingTime = remaining;
                }
            }
        }
    }

    const totalWidth = (GRID_COLS * TILE_SIZE) + (TILE_SIZE * 2);
    const totalHeight = (GRID_ROWS * TILE_SIZE) + (TILE_SIZE * 2);

    const canvas = Canvas.createCanvas(totalWidth, totalHeight);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false; 

    ctx.fillStyle = '#e2c286'; 
    ctx.fillRect(0, 0, totalWidth, totalHeight);

    if (images.cornerTL) ctx.drawImage(images.cornerTL, 0, 0, TILE_SIZE, TILE_SIZE);
    if (images.cornerTR) ctx.drawImage(images.cornerTR, totalWidth - TILE_SIZE, 0, TILE_SIZE, TILE_SIZE);
    if (images.cornerBL) ctx.drawImage(images.cornerBL, 0, totalHeight - TILE_SIZE, TILE_SIZE, TILE_SIZE);
    if (images.cornerBR) ctx.drawImage(images.cornerBR, totalWidth - TILE_SIZE, totalHeight - TILE_SIZE, TILE_SIZE, TILE_SIZE);

    for (let c = 0; c < GRID_COLS; c++) {
        const x = (c + 1) * TILE_SIZE;
        if (images.borderTop) ctx.drawImage(images.borderTop, x, 0, TILE_SIZE, TILE_SIZE);
        if (images.borderBottom) ctx.drawImage(images.borderBottom, x, totalHeight - TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }

    for (let r = 0; r < GRID_ROWS; r++) {
        const y = (r + 1) * TILE_SIZE;
        if (images.borderLeft) ctx.drawImage(images.borderLeft, 0, y, TILE_SIZE, TILE_SIZE);
        if (images.borderRight) ctx.drawImage(images.borderRight, totalWidth - TILE_SIZE, y, TILE_SIZE, TILE_SIZE);
    }

    const startX = TILE_SIZE;
    const startY = TILE_SIZE;

    for (let i = 1; i <= MAX_GAME_PLOTS; i++) {
        const index = i - 1;
        const col = index % GRID_COLS;
        const row = Math.floor(index / GRID_COLS);
        
        const x = startX + (col * TILE_SIZE);
        const y = startY + (row * TILE_SIZE);

        if (images.grass) ctx.drawImage(images.grass, x, y, TILE_SIZE, TILE_SIZE);

        if (i > unlockedPlots) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
            if (images.lock) {
                ctx.drawImage(images.lock, x, y, TILE_SIZE, TILE_SIZE);
            }
        } else {
            const plotData = userPlots.find(p => parseInt(p.plotid) === i);
            
            if (plotData && plotData.status === 'tilled') {
                if (images.tilled) ctx.drawImage(images.tilled, x, y, TILE_SIZE, TILE_SIZE);
            } 
            else if (plotData && plotData.status === 'planted') {
                if (images.tilled) ctx.drawImage(images.tilled, x, y, TILE_SIZE, TILE_SIZE);

                const seed = seedsData.find(s => s.id === plotData.seedid);
                if (seed) {
                    const growthMs = (seed.growth_time_hours * 3600000) * growthMultiplier;
                    const witherMs = seed.wither_time_hours * 3600000;
                    const age = now - parseInt(plotData.planttime);

                    if (age >= (growthMs + witherMs)) {
                        if (images.withered) ctx.drawImage(images.withered, x, y, TILE_SIZE, TILE_SIZE);
                        witheredCount++;
                    } else if (age >= growthMs) {
                        const cropImg = await getCropImage(seed.id);
                        if (cropImg) ctx.drawImage(cropImg, x, y, TILE_SIZE, TILE_SIZE);
                        readyCount++;
                    } else {
                        if (images.sprout) ctx.drawImage(images.sprout, x, y, TILE_SIZE, TILE_SIZE);
                    }
                }
            }
        }
    }

    const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'farm-view.png' });

    const rowActions = new ActionRowBuilder();
    
    if (canPlow) {
        rowActions.addComponents(
            new ButtonBuilder().setCustomId(`land_plow_one_${userId}`).setLabel(`حـراثـة`).setStyle(ButtonStyle.Secondary).setEmoji('⛏️'),
            new ButtonBuilder().setCustomId(`land_plow_all_${userId}`).setLabel(`حـراثـة الكـل (${totalPlowCost})`).setStyle(ButtonStyle.Primary).setEmoji('🚜')
        );
    }

    if (hasTilled) {
        rowActions.addComponents(
            new ButtonBuilder().setCustomId(`land_start_plant_${userId}`).setLabel(`زراعـة`).setStyle(ButtonStyle.Success).setEmoji('🌱')
        );
    }

    if (readyCount > 0) {
        rowActions.addComponents(
            new ButtonBuilder().setCustomId(`land_harvest_all_${userId}`).setLabel('حصـاد').setStyle(ButtonStyle.Success).setEmoji('🌾')
        );
    }
    
    if (witheredCount > 0) {
        rowActions.addComponents(
            new ButtonBuilder().setCustomId(`land_clean_all_${userId}`).setLabel('تنظيـف').setStyle(ButtonStyle.Danger).setEmoji('🚿')
        );
    }

    if (minRemainingTime !== Infinity) {
        const hours = Math.floor(minRemainingTime / (1000 * 60 * 60));
        const minutes = Math.floor((minRemainingTime % (1000 * 60 * 60)) / (1000 * 60));
        const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

        let kingBuffText = growthMultiplier < 1.0 ? "👑 " : "";

        rowActions.addComponents(
            new ButtonBuilder()
                .setCustomId('info_growth_time') 
                .setLabel(`${kingBuffText}⏳ النـمو: ${timeString}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true) 
        );
    }

    try {
        const workerBuffRes = await db.query("SELECT expiresat FROM user_buffs WHERE userid = $1 AND guildid = $2 AND bufftype = 'farm_worker' AND expiresat > $3", [userId, guildId, now]);
        const workerBuff = workerBuffRes.rows[0];
        
        if (workerBuff) {
            const timeLeft = parseInt(workerBuff.expiresat) - now;
            const daysLeft = Math.floor(timeLeft / (24 * 60 * 60 * 1000));
            const hoursLeft = Math.floor((timeLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
            
            const timeString = `${daysLeft} يـ ${hoursLeft} سـ`;

            rowActions.addComponents(
                new ButtonBuilder()
                    .setCustomId('info_worker_status')
                    .setLabel(`👨‍🌾 العامل: ${timeString}`)
                    .setStyle(ButtonStyle.Secondary) 
                    .setDisabled(true) 
            );
        }
    } catch (e) { console.error("Error fetching worker status:", e); }

    return { 
        content: `**🌱 مزرعة ${interaction.member ? interaction.member.displayName : user.username}**`, 
        components: rowActions.components.length > 0 ? [rowActions] : [], 
        files: [attachment]
    };
}

async function handleLandInteractions(i, client, db) {
    await ensureLandTable(db); 
    
    if (!i.customId.startsWith('land_') && !i.customId.startsWith('farm_plant_modal_')) return;

    const parts = i.customId.split('_');
    const ownerId = parts[parts.length - 1]; 
    const baseAction = parts.slice(0, parts.length - 1).join('_'); 

    if (i.user.id !== ownerId) {
        return await i.reply({ 
            content: `🚫 **هذه المزرعة ليست لك!**\nاستخدم أمر \`/مزرعتي\` لعرض مزرعتك الخاصة.`, 
            flags: [MessageFlags.Ephemeral] 
        });
    }

    const userId = i.user.id;
    const guildId = i.guild.id;
    const growthMultiplier = await getGrowthMultiplier(i.member, guildId, db);

    const updateView = async () => {
        const data = await renderLand(i, client, db);
        await i.editReply({ 
            content: data.content, 
            components: data.components, 
            files: data.files,
            embeds: [] 
        });
    };

    if (baseAction === 'land_plow_one') {
        await i.deferUpdate();

        let maxPlots = await getLandPlots(client, userId, guildId);
        if (maxPlots >= 30) maxPlots = 36;
        
        let targetPlot = null;
        const userPlotsRes = await db.query("SELECT * FROM user_lands WHERE userid = $1 AND guildid = $2", [userId, guildId]);
        const userPlots = userPlotsRes.rows;
        const recordedIds = userPlots.map(p => parseInt(p.plotid));

        for (let pid = 1; pid <= maxPlots; pid++) {
            if (!recordedIds.includes(pid)) { targetPlot = pid; break; } 
            else {
                const plot = userPlots.find(p => parseInt(p.plotid) === pid);
                if (plot && plot.status === 'empty') { targetPlot = pid; break; }
            }
        }

        if (!targetPlot) return await i.followUp({ content: "🚫 **لا توجد أرض فارغة!**", flags: [MessageFlags.Ephemeral] });

        await db.query(`
            INSERT INTO user_lands (userid, guildid, plotid, status) 
            VALUES ($1, $2, $3, 'tilled')
            ON CONFLICT (userid, guildid, plotid) DO UPDATE SET status = EXCLUDED.status
        `, [userId, guildId, targetPlot]);

        await updateView();
        return;
    }

    if (baseAction === 'land_plow_all') {
        await i.deferUpdate();
        let maxPlots = await getLandPlots(client, userId, guildId);
        if (maxPlots >= 30) maxPlots = 36;

        const existingPlotsRes = await db.query("SELECT * FROM user_lands WHERE userid = $1 AND guildid = $2", [userId, guildId]);
        const existingPlots = existingPlotsRes.rows;
        const existingIds = existingPlots.map(p => parseInt(p.plotid));
        let plotsToPlow = [];

        for (let pid = 1; pid <= maxPlots; pid++) {
            if (!existingIds.includes(pid)) plotsToPlow.push(pid);
            else {
                const plot = existingPlots.find(p => parseInt(p.plotid) === pid);
                if (plot && plot.status === 'empty') plotsToPlow.push(pid);
            }
        }

        if (plotsToPlow.length === 0) return await i.followUp({ content: "🚫 **لا توجد أراضي بور!**", flags: [MessageFlags.Ephemeral] });

        const totalCost = plotsToPlow.length * PLOW_COST_BULK;
        
        // 🔥 تصحيح: استخدام "user" و guild بدلاً من userid و guildid
        const userDataRes = await db.query('SELECT mora FROM levels WHERE "user" = $1 AND guild = $2', [userId, guildId]);
        let userData = userDataRes.rows[0];
        
        if (!userData) {
            return await i.followUp({ content: "❌ **لم يتم العثور على بياناتك!** حاول كتابة رسالة في الشات أولاً لتسجيل دخولك.", flags: [MessageFlags.Ephemeral] });
        }

        if (userData.mora < totalCost) return await i.followUp({ content: `❌ **رصيدك غير كافي!** تحتاج **${totalCost}** ${EMOJI_MORA}`, flags: [MessageFlags.Ephemeral] });
        
        userData.mora -= totalCost;
        // 🔥 تصحيح: استخدام "user" و guild بدلاً من userid و guildid
        await db.query('UPDATE levels SET mora = $1 WHERE "user" = $2 AND guild = $3', [userData.mora, userId, guildId]);

        try {
            await db.query("BEGIN");
            for (const pid of plotsToPlow) {
                await db.query(`
                    INSERT INTO user_lands (userid, guildid, plotid, status) 
                    VALUES ($1, $2, $3, 'tilled')
                    ON CONFLICT (userid, guildid, plotid) DO UPDATE SET status = EXCLUDED.status
                `, [userId, guildId, pid]);
            }
            await db.query("COMMIT");
        } catch (e) {
            await db.query("ROLLBACK");
            console.error("Error plowing all lands:", e);
        }

        await updateView();
        return;
    }

    if (baseAction === 'land_start_plant') {
        const seedOptions = await Promise.all(seedsData.map(async s => {
            const count = await getSeedCount(db, userId, guildId, s.id);
            return new StringSelectMenuOptionBuilder()
                .setLabel(s.name)
                .setDescription(`لديك: ${count}`)
                .setValue(s.id)
                .setEmoji(s.emoji);
        }));

        const msgId = i.message.id;
        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`land_plant_select_seed_${msgId}_${userId}`)
                .setPlaceholder('اختر نوع البذور...')
                .addOptions(seedOptions)
        );

        await i.reply({ content: '🌱 **اختر البذور:**', components: [row], flags: [MessageFlags.Ephemeral] });
        return;
    }

    if (i.isStringSelectMenu() && i.customId.startsWith('land_plant_select_seed')) {
        const rawAction = i.customId; 
        const rawParts = rawAction.split('_');
        const msgId = rawParts[rawParts.length - 2]; 

        const seedId = i.values[0];
        const seed = seedsData.find(s => s.id === seedId);
        
        const modal = new ModalBuilder().setCustomId(`farm_plant_modal_${msgId}_${seedId}_${userId}`).setTitle(`زراعة ${seed.name}`);
        const input = new TextInputBuilder().setCustomId('plant_qty').setLabel('العدد').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await i.showModal(modal);
        return; 
    }

    if (i.isModalSubmit() && i.customId.startsWith('farm_plant_modal_')) {
        await i.deferReply({ flags: [MessageFlags.Ephemeral] });
        
        const rawModalId = i.customId.replace('farm_plant_modal_', ''); 
        const firstUnderscore = rawModalId.indexOf('_');
        const msgId = rawModalId.substring(0, firstUnderscore);
        const rest = rawModalId.substring(firstUnderscore + 1);
        const lastUnderscore = rest.lastIndexOf('_');
        const seedId = rest.substring(0, lastUnderscore);
        
        const qtyInput = parseInt(i.fields.getTextInputValue('plant_qty'));
        const seed = seedsData.find(s => s.id === seedId);

        if (isNaN(qtyInput) || qtyInput <= 0) return await i.editReply("❌ رقم خطأ.");

        const tilledPlotsRes = await db.query("SELECT * FROM user_lands WHERE userid = $1 AND guildid = $2 AND status = 'tilled'", [userId, guildId]);
        const tilledPlots = tilledPlotsRes.rows;
        
        const invItemRes = await db.query("SELECT quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3", [userId, guildId, seedId]);
        const invItem = invItemRes.rows[0];
        const seedStock = invItem ? invItem.quantity : 0;

        const countToPlant = Math.min(qtyInput, tilledPlots.length, seedStock);

        if (countToPlant === 0) return await i.editReply("❌ لا يمكن الزراعة (نقص بذور أو أرض محروثة).");

        if (seedStock === countToPlant) {
            await db.query("DELETE FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3", [userId, guildId, seedId]);
        } else {
            await db.query("UPDATE user_inventory SET quantity = quantity - $1 WHERE userid = $2 AND guildid = $3 AND itemid = $4", [countToPlant, userId, guildId, seedId]);
        }

        const now = Date.now();
        
        try {
            await db.query("BEGIN");
            for (let k = 0; k < countToPlant; k++) {
                await db.query("UPDATE user_lands SET status = 'planted', seedid = $1, planttime = $2 WHERE userid = $3 AND guildid = $4 AND plotid = $5", [seed.id, now, userId, guildId, tilledPlots[k].plotid]);
            }
            await db.query("COMMIT");
        } catch (e) {
            await db.query("ROLLBACK");
            console.error("Error planting seeds:", e);
        }

        await i.editReply(`✅ **تم زراعة ${countToPlant}x ${seed.name}**`);

        try {
            const mainMsg = await i.channel.messages.fetch(msgId).catch(() => null);
            if (mainMsg) {
                const newData = await renderLand(i, client, db);
                await mainMsg.edit({
                    content: newData.content,
                    embeds: [], 
                    components: newData.components,
                    files: newData.files
                });
            }
        } catch (err) {
            console.error("Failed to update farm image after planting:", err);
        }
        
        return;
    }

    if (baseAction === 'land_harvest_all') {
        await i.deferUpdate();
        const plantedPlotsRes = await db.query("SELECT * FROM user_lands WHERE userid = $1 AND guildid = $2 AND status = 'planted'", [userId, guildId]);
        const plantedPlots = plantedPlotsRes.rows;
        const now = Date.now();
        let totalRevenue = 0, totalXP = 0, harvestedCount = 0;
        const plotsToReset = [];

        for (const plot of plantedPlots) {
            const seed = seedsData.find(s => s.id === plot.seedid);
            if (!seed) continue;
            const growthMs = (seed.growth_time_hours * 3600000) * growthMultiplier;
            const witherMs = seed.wither_time_hours * 3600000;
            const age = now - parseInt(plot.planttime);

            if (age >= growthMs && age < (growthMs + witherMs)) {
                totalRevenue += seed.sell_price;
                totalXP += seed.xp_reward;
                harvestedCount++;
                plotsToReset.push(plot.plotid);
            }
        }

        if (harvestedCount === 0) return await i.followUp({ content: "🚫 لا يوجد حصاد جاهز.", flags: [MessageFlags.Ephemeral] });

        try {
            await db.query("BEGIN");
            for (const pid of plotsToReset) {
                await db.query("UPDATE user_lands SET status = 'empty', seedid = NULL, planttime = NULL WHERE userid = $1 AND guildid = $2 AND plotid = $3", [userId, guildId, pid]);
            }
            await db.query("COMMIT");
        } catch (e) {
            await db.query("ROLLBACK");
            console.error("Error harvesting crops:", e);
        }

        // 🔥 تصحيح: استخدام "user" و guild بدلاً من userid و guildid
        const userDataRes = await db.query('SELECT * FROM levels WHERE "user" = $1 AND guild = $2', [userId, guildId]);
        let userData = userDataRes.rows[0];
        
        if (!userData) {
            userData = { user: userId, guild: guildId, xp: 0, level: 1, mora: 0, totalxp: 0 };
            // 🔥 تصحيح
            await db.query('INSERT INTO levels ("user", guild, xp, level, totalxp, mora) VALUES ($1, $2, $3, $4, $5, $6)', [userId, guildId, 0, 1, 0, 0]);
        }

        userData.mora = parseInt(userData.mora) + totalRevenue;
        userData.xp = parseInt(userData.xp) + totalXP;
        userData.totalxp = parseInt(userData.totalxp || userData.totalXP) + totalXP;
        
        // 🔥 تصحيح
        await db.query('UPDATE levels SET mora = $1, xp = $2, totalxp = $3 WHERE "user" = $4 AND guild = $5', [userData.mora, userData.xp, userData.totalxp, userId, guildId]);

        if (updateGuildStat) {
            updateGuildStat(client, guildId, userId, 'crops_harvested', totalRevenue);
        }

        await i.followUp({ content: `🌾 **تم الحصاد!** (+${totalRevenue} مورا, +${totalXP} XP)`, flags: [MessageFlags.Ephemeral] });
        await updateView();
        return;
    }

    if (baseAction === 'land_clean_all') {
        await i.deferUpdate();
        const plantedPlotsRes = await db.query("SELECT * FROM user_lands WHERE userid = $1 AND guildid = $2 AND status = 'planted'", [userId, guildId]);
        const plantedPlots = plantedPlotsRes.rows;
        const now = Date.now();
        const plotsToReset = [];

        for (const plot of plantedPlots) {
            const seed = seedsData.find(s => s.id === plot.seedid);
            if (!seed) { plotsToReset.push(plot.plotid); continue; }
            const growthMs = (seed.growth_time_hours * 3600000) * growthMultiplier;
            const witherMs = seed.wither_time_hours * 3600000;
            const age = now - parseInt(plot.planttime);
            if (age >= (growthMs + witherMs)) plotsToReset.push(plot.plotid);
        }

        try {
            await db.query("BEGIN");
            for (const pid of plotsToReset) {
                await db.query("UPDATE user_lands SET status = 'empty', seedid = NULL, planttime = NULL WHERE userid = $1 AND guildid = $2 AND plotid = $3", [userId, guildId, pid]);
            }
            await db.query("COMMIT");
        } catch (e) {
            await db.query("ROLLBACK");
            console.error("Error cleaning withered crops:", e);
        }

        await i.followUp({ content: `🚿 **تم التنظيف.**`, flags: [MessageFlags.Ephemeral] });
        await updateView();
        return;
    }
}

async function getSeedCount(db, userId, guildId, seedId) {
    const invItemRes = await db.query("SELECT quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3", [userId, guildId, seedId]);
    const invItem = invItemRes.rows[0];
    return invItem ? invItem.quantity : 0;
}

module.exports = { renderLand, handleLandInteractions };
