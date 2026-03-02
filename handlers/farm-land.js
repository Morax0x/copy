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

function ensureLandTable(sql) {
    sql.prepare(`
        CREATE TABLE IF NOT EXISTS user_lands (
            userID TEXT,
            guildID TEXT,
            plotID INTEGER,
            status TEXT, 
            seedID TEXT,
            plantTime INTEGER,
            PRIMARY KEY (userID, guildID, plotID)
        )
    `).run();
}

function getGrowthMultiplier(member, guildId, sql) {
    try {
        const settings = sql.prepare("SELECT roleFarmKing FROM settings WHERE guild = ?").get(guildId);
        if (settings && settings.roleFarmKing && member && member.roles && member.roles.cache.has(settings.roleFarmKing)) {
            return 0.70; 
        }
    } catch(e) {}
    return 1.0;
}

async function renderLand(interaction, client, sql) {
    ensureLandTable(sql);
    
    const images = await loadAllImages();

    const user = interaction.user || interaction.author; 
    const userId = user.id;
    const guildId = interaction.guild.id;
    
    let unlockedPlots = getLandPlots(client, userId, guildId);
    if (unlockedPlots >= 30) unlockedPlots = 36; 

    const userPlots = sql.prepare("SELECT * FROM user_lands WHERE userID = ? AND guildID = ?").all(userId, guildId);
    const now = Date.now();

    const member = interaction.member || await interaction.guild.members.fetch(userId).catch(()=>null);
    const growthMultiplier = getGrowthMultiplier(member, guildId, sql);

    let canPlow = false;        
    let hasTilled = false;      
    let readyCount = 0;         
    let witheredCount = 0;      
    let minRemainingTime = Infinity;
    let totalPlowCost = 0;

    for (let i = 1; i <= unlockedPlots; i++) {
        const p = userPlots.find(x => x.plotID === i);
        
        if (!p || p.status === 'empty') {
            totalPlowCost += PLOW_COST_BULK;
            canPlow = true;
        }
        
        if (p && p.status === 'tilled') {
            hasTilled = true;
        }

        if (p && p.status === 'planted' && p.seedID) {
            const seed = seedsData.find(s => s.id === p.seedID);
            if (seed) {
                const growthMs = (seed.growth_time_hours * 3600000) * growthMultiplier;
                const age = now - p.plantTime;
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
            const plotData = userPlots.find(p => p.plotID === i);
            
            if (plotData && plotData.status === 'tilled') {
                if (images.tilled) ctx.drawImage(images.tilled, x, y, TILE_SIZE, TILE_SIZE);
            } 
            else if (plotData && plotData.status === 'planted') {
                if (images.tilled) ctx.drawImage(images.tilled, x, y, TILE_SIZE, TILE_SIZE);

                const seed = seedsData.find(s => s.id === plotData.seedID);
                if (seed) {
                    const growthMs = (seed.growth_time_hours * 3600000) * growthMultiplier;
                    const witherMs = seed.wither_time_hours * 3600000;
                    const age = now - plotData.plantTime;

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
        const workerBuff = sql.prepare("SELECT expiresAt FROM user_buffs WHERE userID = ? AND guildID = ? AND buffType = 'farm_worker' AND expiresAt > ?").get(userId, guildId, now);
        
        if (workerBuff) {
            const timeLeft = workerBuff.expiresAt - now;
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
        content: `**🌱 مزرعة ${interaction.member.displayName}**`, 
        components: rowActions.components.length > 0 ? [rowActions] : [], 
        files: [attachment]
    };
}

async function handleLandInteractions(i, client, sql) {
    ensureLandTable(sql); 
    
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
    const growthMultiplier = getGrowthMultiplier(i.member, guildId, sql);

    const updateView = async () => {
        const data = await renderLand(i, client, sql);
        await i.editReply({ 
            content: data.content, 
            components: data.components, 
            files: data.files,
            embeds: [] 
        });
    };

    if (baseAction === 'land_plow_one') {
        await i.deferUpdate();

        let maxPlots = getLandPlots(client, userId, guildId);
        if (maxPlots >= 30) maxPlots = 36;
        
        let targetPlot = null;
        const userPlots = sql.prepare("SELECT * FROM user_lands WHERE userID = ? AND guildID = ?").all(userId, guildId);
        const recordedIds = userPlots.map(p => p.plotID);

        for (let pid = 1; pid <= maxPlots; pid++) {
            if (!recordedIds.includes(pid)) { targetPlot = pid; break; } 
            else {
                const plot = userPlots.find(p => p.plotID === pid);
                if (plot.status === 'empty') { targetPlot = pid; break; }
            }
        }

        if (!targetPlot) return await i.followUp({ content: "🚫 **لا توجد أرض فارغة!**", flags: [MessageFlags.Ephemeral] });

        sql.prepare("INSERT OR REPLACE INTO user_lands (userID, guildID, plotID, status) VALUES (?, ?, ?, 'tilled')")
            .run(userId, guildId, targetPlot);

        await updateView();
        return;
    }

    if (baseAction === 'land_plow_all') {
        await i.deferUpdate();
        let maxPlots = getLandPlots(client, userId, guildId);
        if (maxPlots >= 30) maxPlots = 36;

        const existingPlots = sql.prepare("SELECT plotID FROM user_lands WHERE userID = ? AND guildID = ?").all(userId, guildId);
        const existingIds = existingPlots.map(p => p.plotID);
        let plotsToPlow = [];

        for (let pid = 1; pid <= maxPlots; pid++) {
            if (!existingIds.includes(pid)) plotsToPlow.push(pid);
            else {
                const plot = sql.prepare("SELECT status FROM user_lands WHERE userID = ? AND guildID = ? AND plotID = ?").get(userId, guildId, pid);
                if (plot.status === 'empty') plotsToPlow.push(pid);
            }
        }

        if (plotsToPlow.length === 0) return await i.followUp({ content: "🚫 **لا توجد أراضي بور!**", flags: [MessageFlags.Ephemeral] });

        const totalCost = plotsToPlow.length * PLOW_COST_BULK;
        let userData = client.getLevel.get(userId, guildId);
        
        if (!userData) {
            return await i.followUp({ content: "❌ **لم يتم العثور على بياناتك!** حاول كتابة رسالة في الشات أولاً لتسجيل دخولك.", flags: [MessageFlags.Ephemeral] });
        }

        if (userData.mora < totalCost) return await i.followUp({ content: `❌ **رصيدك غير كافي!** تحتاج **${totalCost}** ${EMOJI_MORA}`, flags: [MessageFlags.Ephemeral] });
        
        userData.mora -= totalCost;
        client.setLevel.run(userData);

        const stmtInsert = sql.prepare("INSERT OR REPLACE INTO user_lands (userID, guildID, plotID, status) VALUES (?, ?, ?, 'tilled')");
        const transaction = sql.transaction(() => {
            for (const pid of plotsToPlow) stmtInsert.run(userId, guildId, pid);
        });
        transaction();

        await updateView();
        return;
    }

    if (baseAction === 'land_start_plant') {
        const seedOptions = seedsData.map(s => new StringSelectMenuOptionBuilder()
            .setLabel(s.name)
            .setDescription(`لديك: ${getSeedCount(sql, userId, guildId, s.id)}`)
            .setValue(s.id)
            .setEmoji(s.emoji)
        );

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

        const tilledPlots = sql.prepare("SELECT plotID FROM user_lands WHERE userID = ? AND guildID = ? AND status = 'tilled'").all(userId, guildId);
        const invItem = sql.prepare("SELECT quantity FROM user_inventory WHERE userID = ? AND guildID = ? AND itemID = ?").get(userId, guildId, seedId);
        const seedStock = invItem ? invItem.quantity : 0;

        const countToPlant = Math.min(qtyInput, tilledPlots.length, seedStock);

        if (countToPlant === 0) return await i.editReply("❌ لا يمكن الزراعة (نقص بذور أو أرض محروثة).");

        if (seedStock === countToPlant) sql.prepare("DELETE FROM user_inventory WHERE userID = ? AND guildID = ? AND itemID = ?").run(userId, guildId, seedId);
        else sql.prepare("UPDATE user_inventory SET quantity = quantity - ? WHERE userID = ? AND guildID = ? AND itemID = ?").run(countToPlant, userId, guildId, seedId);

        const now = Date.now();
        const stmtPlant = sql.prepare("UPDATE user_lands SET status = 'planted', seedID = ?, plantTime = ? WHERE userID = ? AND guildID = ? AND plotID = ?");
        
        const transaction = sql.transaction(() => {
            for (let k = 0; k < countToPlant; k++) stmtPlant.run(seed.id, now, userId, guildId, tilledPlots[k].plotID);
        });
        transaction();

        await i.editReply(`✅ **تم زراعة ${countToPlant}x ${seed.name}**`);

        try {
            const mainMsg = await i.channel.messages.fetch(msgId).catch(() => null);
            if (mainMsg) {
                const newData = await renderLand(i, client, sql);
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
        const plantedPlots = sql.prepare("SELECT * FROM user_lands WHERE userID = ? AND guildID = ? AND status = 'planted'").all(userId, guildId);
        const now = Date.now();
        let totalRevenue = 0, totalXP = 0, harvestedCount = 0;
        const plotsToReset = [];

        for (const plot of plantedPlots) {
            const seed = seedsData.find(s => s.id === plot.seedID);
            if (!seed) continue;
            const growthMs = (seed.growth_time_hours * 3600000) * growthMultiplier;
            const witherMs = seed.wither_time_hours * 3600000;
            const age = now - plot.plantTime;

            if (age >= growthMs && age < (growthMs + witherMs)) {
                totalRevenue += seed.sell_price;
                totalXP += seed.xp_reward;
                harvestedCount++;
                plotsToReset.push(plot.plotID);
            }
        }

        if (harvestedCount === 0) return await i.followUp({ content: "🚫 لا يوجد حصاد جاهز.", flags: [MessageFlags.Ephemeral] });

        const stmtReset = sql.prepare("UPDATE user_lands SET status = 'empty', seedID = NULL, plantTime = NULL WHERE userID = ? AND guildID = ? AND plotID = ?");
        const transaction = sql.transaction(() => {
            for (const pid of plotsToReset) stmtReset.run(userId, guildId, pid);
        });
        transaction();

        let userData = client.getLevel.get(userId, guildId);
        
        if (!userData) {
            userData = { user: userId, guild: guildId, xp: 0, level: 1, mora: 0, totalXP: 0 };
        }

        userData.mora += totalRevenue;
        userData.xp += totalXP;
        userData.totalXP += totalXP;
        client.setLevel.run(userData);

        if (updateGuildStat) {
            // 🔥 تم تغيير harvestedCount إلى totalRevenue لإضافة القيمة السوقية في اللوحة 🔥
            updateGuildStat(client, guildId, userId, 'crops_harvested', totalRevenue);
        }

        await i.followUp({ content: `🌾 **تم الحصاد!** (+${totalRevenue} مورا, +${totalXP} XP)`, flags: [MessageFlags.Ephemeral] });
        await updateView();
        return;
    }

    if (baseAction === 'land_clean_all') {
        await i.deferUpdate();
        const plantedPlots = sql.prepare("SELECT * FROM user_lands WHERE userID = ? AND guildID = ? AND status = 'planted'").all(userId, guildId);
        const now = Date.now();
        const plotsToReset = [];

        for (const plot of plantedPlots) {
            const seed = seedsData.find(s => s.id === plot.seedID);
            if (!seed) { plotsToReset.push(plot.plotID); continue; }
            const growthMs = (seed.growth_time_hours * 3600000) * growthMultiplier;
            const witherMs = seed.wither_time_hours * 3600000;
            const age = now - plot.plantTime;
            if (age >= (growthMs + witherMs)) plotsToReset.push(plot.plotID);
        }

        const stmtReset = sql.prepare("UPDATE user_lands SET status = 'empty', seedID = NULL, plantTime = NULL WHERE userID = ? AND guildID = ? AND plotID = ?");
        const transaction = sql.transaction(() => {
            for (const pid of plotsToReset) stmtReset.run(userId, guildId, pid);
        });
        transaction();

        await i.followUp({ content: `🚿 **تم التنظيف.**`, flags: [MessageFlags.Ephemeral] });
        await updateView();
        return;
    }
}

function getSeedCount(sql, userId, guildId, seedId) {
    const invItem = sql.prepare("SELECT quantity FROM user_inventory WHERE userID = ? AND guildID = ? AND itemID = ?").get(userId, guildId, seedId);
    return invItem ? invItem.quantity : 0;
}

module.exports = { renderLand, handleLandInteractions };
