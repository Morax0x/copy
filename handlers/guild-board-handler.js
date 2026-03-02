// handlers/guild-board-handler.js

const { EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags, AttachmentBuilder, PermissionsBitField } = require("discord.js");
const { buildAchievementsEmbed, buildDailyEmbed, buildWeeklyEmbed } = require('../commands/achievements.js');
const { fetchLeaderboardData } = require('../commands/top.js'); // 🔥 تأكدنا من استدعاء الدالة الصحيحة من ملف التوب
const questsConfig = require('../json/quests-config.json');
const weaponsConfig = require('../json/weapons-config.json');

const { generateAdventurerCard } = require('../generators/adventurer-card-generator.js'); 
const { generateHallOfFame } = require('../generators/hall-of-fame-generator.js');
const { generateGuideImage } = require('../generators/guide-generator.js'); 

const { generateKingsBoardImage } = require('../generators/guild-boards-generator.js');
const { generateEpicAnnouncement } = require('../generators/announcement-generator.js');
const { generateNotificationControlPanel } = require('../generators/notification-generator.js');

const { GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const announcementsTexts = require('../json/announcements-texts.js');

try { GlobalFonts.registerFromPath(path.join(__dirname, '../fonts/bein-ar-normal.ttf'), 'Bein'); } catch (e) {}

const EMOJI_MORA = '<:mora:1435647151349698621>';
const EMOJI_STAR = '⭐';
const OWNER_ID = "1145327691772481577";

const RACE_TRANSLATIONS = new Map([
    ['Human', 'بشري'], ['Dragon', 'تنين'], ['Elf', 'آلف'], ['Dark Elf', 'آلف الظلام'],
    ['Seraphim', 'سيرافيم'], ['Demon', 'شيطان'], ['Vampire', 'مصاص دماء'], 
    ['Spirit', 'روح'], ['Dwarf', 'قزم'], ['Ghoul', 'غول'], ['Hybrid', 'نصف وحش']
]);

function getTodayDateString() { 
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
}

function getWeekStartDateString() {
    const ksaTime = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Riyadh" }));
    const diff = ksaTime.getDate() - (ksaTime.getDay() + 2) % 7; 
    const friday = new Date(ksaTime.setDate(diff));
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(friday);
}

function ensureKingTrackerTable(sql) {
    try {
        sql.prepare(`CREATE TABLE IF NOT EXISTS kings_board_tracker (
            id TEXT PRIMARY KEY,
            userID TEXT,
            guildID TEXT,
            date TEXT,
            casino_profit INTEGER DEFAULT 0,
            mora_earned INTEGER DEFAULT 0,
            messages INTEGER DEFAULT 0,
            mora_donated INTEGER DEFAULT 0,
            ai_interactions INTEGER DEFAULT 0,
            fish_caught INTEGER DEFAULT 0,
            pvp_wins INTEGER DEFAULT 0,
            crops_harvested INTEGER DEFAULT 0
        )`).run();
    } catch (e) {}
}

function createNotifButton(label, customId, currentStatus) {
    const isEnabled = currentStatus === 1;
    return new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(`${label}: ${isEnabled ? 'مفعل ✅' : 'معطل ❌'}`)
        .setStyle(isEnabled ? ButtonStyle.Success : ButtonStyle.Danger);
}

function getRotatedQuests(pool, countNormal, countElite, seedStr) {
    const normalPool = pool.filter(q => !q.repReward || q.repReward === 0);
    const elitePool = pool.filter(q => q.repReward && q.repReward > 0);
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
    hash = Math.abs(hash);
    let selected = []; let nPool = [...normalPool];
    for(let i=0; i<countNormal; i++) { if(nPool.length === 0) break; let index = (hash + i) % nPool.length; selected.push(nPool[index]); nPool.splice(index, 1); }
    let ePool = [...elitePool];
    for(let i=0; i<countElite; i++) { if(ePool.length === 0) break; let index = (hash + i) % ePool.length; selected.push(ePool[index]); ePool.splice(index, 1); }
    return selected;
}

function getUserStat(userId, guildId, statName, sql) {
    let val = 0;
    try {
        const lvlData = sql.prepare("SELECT * FROM levels WHERE user = ? AND guild = ?").get(userId, guildId);
        if (lvlData && lvlData[statName] !== undefined) return parseInt(lvlData[statName]) || 0;
        const totalData = sql.prepare("SELECT * FROM user_total_stats WHERE userID = ? AND guildID = ?").get(userId, guildId);
        if (totalData && totalData[statName] !== undefined) return parseInt(totalData[statName]) || 0;
        if (statName === 'highestStreak') {
             const streakData = sql.prepare("SELECT highestStreak FROM streaks WHERE userID = ? AND guildID = ?").get(userId, guildId);
             return streakData ? (parseInt(streakData.highestStreak) || 0) : 0;
        }
    } catch (e) {} return val;
}

function getRepRankInfo(points) {
    if (points >= 1000) return { name: '👑 رتبة SS', color: '#FF0055' }; 
    if (points >= 500)  return { name: '💎 رتبة S', color: '#9D00FF' }; 
    if (points >= 250)  return { name: '🥇 رتبة A', color: '#FFD700' }; 
    if (points >= 100)  return { name: '🥈 رتبة B', color: '#00FF88' }; 
    if (points >= 50)   return { name: '🥉 رتبة C', color: '#00BFFF' }; 
    if (points >= 25)   return { name: '⚔️ رتبة D', color: '#A9A9A9' }; 
    if (points >= 10)   return { name: '🛡️ رتبة E', color: '#B87333' }; 
    return { name: '🪵 رتبة F', color: '#654321' }; 
}

function calculateStrongestRank(sql, guildID, targetUserID) {
    if (targetUserID === OWNER_ID) return 0;
    const weapons = sql.prepare("SELECT userID, raceName, weaponLevel FROM user_weapons WHERE guildID = ? AND userID != ?").all(guildID, OWNER_ID);
    const getLvl = sql.prepare("SELECT level FROM levels WHERE guild = ? AND user = ?");
    const getSkills = sql.prepare("SELECT SUM(skillLevel) as totalLevels FROM user_skills WHERE guildID = ? AND userID = ?");

    let stats = [];
    for (const w of weapons) {
        const conf = weaponsConfig.find(c => c.race === w.raceName);
        if(!conf) continue;
        const dmg = conf.base_damage + (conf.damage_increment * (w.weaponLevel - 1));
        const lvlData = getLvl.get(guildID, w.userID);
        const playerLevel = lvlData?.level || 1;
        const hp = 100 + (playerLevel * 4);
        const skillData = getSkills.get(guildID, w.userID);
        const skillLevelsTotal = skillData ? (skillData.totalLevels || 0) : 0;
        const powerScore = Math.floor(dmg + (hp * 0.5) + (playerLevel * 10) + (skillLevelsTotal * 20));
        stats.push({ userID: w.userID, powerScore });
    }
    stats.sort((a, b) => b.powerScore - a.powerScore);
    return stats.findIndex(s => s.userID === targetUserID) + 1; 
}

function chunkButtons(buttons) {
    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    return rows;
}

async function buildMyAchievementsEmbed(interaction, sql, page = 1) {
    try {
        const completed = sql.prepare("SELECT * FROM user_achievements WHERE userID = ? AND guildID = ?").all(interaction.user.id, interaction.guild.id);
        if (completed.length === 0) {
            return { 
                embeds: [new EmbedBuilder().setTitle('🎖️ إنجازاتي').setColor(Colors.DarkRed).setDescription('لم تقم بإكمال أي إنجازات بعد.').setImage('https://i.postimg.cc/L4Yb4zHw/almham_alywmyt-2.png')], 
                components: [], totalPages: 1 
            };
        }
        const completedIDs = new Set(completed.map(c => c.achievementID));
        const completedDetails = questsConfig.achievements.filter(ach => completedIDs.has(ach.id)); 
        const perPage = 10;
        const totalPages = Math.ceil(completedDetails.length / perPage) || 1;
        page = Math.max(1, Math.min(page, totalPages)); 
        const start = (page - 1) * perPage; const end = start + perPage;
        const achievementsToShow = completedDetails.slice(start, end); 

        const embed = new EmbedBuilder()
            .setTitle('🎖️ إنجازاتي المكتملة') 
            .setColor(Colors.DarkRed)
            .setAuthor({ name: interaction.member.displayName, iconURL: interaction.user.displayAvatarURL() })
            .setFooter({ text: `صفحة ${page} / ${totalPages} (الإجمالي: ${completedDetails.length})` }) 
            .setTimestamp()
            .setImage('https://i.postimg.cc/L4Yb4zHw/almham_alywmyt-2.png');

        let description = '';
        for (const ach of achievementsToShow) {
            description += `${ach.emoji || '🏆'} **${ach.name}**\n> ${ach.description}\n> *المكافأة: ${EMOJI_MORA} \`${ach.reward.mora}\` | ${EMOJI_STAR}XP: \`${ach.reward.xp}\`*\n\n`;
        }
        embed.setDescription(description);
        return { embeds: [embed], totalPages: totalPages }; 
    } catch (err) {
        return { embeds: [new EmbedBuilder().setTitle(' خطأ').setDescription('حدث خطأ.').setColor(Colors.Red)], totalPages: 1 };
    }
}

async function handleQuestPanel(i, client, sql) {
    const userId = i.user.id;
    const guildId = i.guild.id;
    const id = `${userId}-${guildId}`;
    const todayStr = getTodayDateString();
    const weekStr = getWeekStartDateString();
    
    let rawId = i.isStringSelectMenu() ? i.values[0] : i.customId;

    if (rawId === 'panel_reputation_guide' || rawId.startsWith('panel_guide_')) {
        let isInitialMenuRequest = (rawId === 'panel_reputation_guide');
        let guideType = 'rep';
        if (rawId.includes('kings')) guideType = rawId.includes('kings_2') ? 'kings_2' : 'kings_1';
        else if (rawId.includes('ach')) guideType = 'ach';

        try {
            const buffer = await generateGuideImage(guideType);
            const attachment = new AttachmentBuilder(buffer, { name: 'guide.png' });

            const guideButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('panel_guide_rep').setLabel('السمعة والرتب').setEmoji('📜').setStyle(guideType === 'rep' ? ButtonStyle.Primary : ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('panel_guide_kings_tab').setLabel('ألقاب الملوك').setEmoji('👑').setStyle(guideType.startsWith('kings') ? ButtonStyle.Primary : ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('panel_guide_ach').setLabel('الأوسمة التفاعلية').setEmoji('🎖️').setStyle(guideType === 'ach' ? ButtonStyle.Primary : ButtonStyle.Secondary)
            );

            let componentsToSend = [guideButtons];

            if (guideType.startsWith('kings')) {
                componentsToSend.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('panel_guide_kings_1').setEmoji('<:left:1439164494759723029>').setStyle(ButtonStyle.Secondary).setDisabled(guideType === 'kings_1'),
                    new ButtonBuilder().setCustomId('panel_guide_kings_2').setEmoji('<:right:1439164491072929915>').setStyle(ButtonStyle.Secondary).setDisabled(guideType === 'kings_2')
                ));
            }

            if (isInitialMenuRequest) {
                await i.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(()=>{});
                return await i.editReply({ files: [attachment], components: componentsToSend }).catch(()=>{});
            } else {
                return await i.update({ files: [attachment], components: componentsToSend, embeds: [], content: null }).catch(()=>{});
            }
        } catch (err) { return; }
    }

    if (i.isButton() && rawId.startsWith('claim_')) {
        await i.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(()=>{});
        try {
            if (rawId.startsWith('claim_quest_')) {
                const parts = rawId.split('_');
                const period = parts[2]; 
                const questId = parts.slice(3).join('_');
                const isDaily = period === 'daily';
                const dateKey = isDaily ? todayStr : weekStr;
                const questsList = isDaily ? questsConfig.daily : questsConfig.weekly;
                
                const quest = questsList.find(q => q.id === questId);
                if (!quest) return i.editReply({ content: '❌ المهمة غير موجودة.' }).catch(()=>{});

                const claimId = `${userId}-${guildId}-${quest.id}-${dateKey}`;
                const isClaimed = sql.prepare("SELECT 1 FROM user_quest_claims WHERE claimID = ?").get(claimId);
                if (isClaimed) return i.editReply({ content: '⚠️ لقد قمت باستلام الجائزة مسبقا!' }).catch(()=>{});

                const table = isDaily ? 'user_daily_stats' : 'user_weekly_stats';
                const dateCol = isDaily ? 'date' : 'weekStartDate';
                const userStats = sql.prepare(`SELECT * FROM ${table} WHERE userID = ? AND guildID = ? AND ${dateCol} = ?`).get(userId, guildId, dateKey) || {};
                
                const currentProgress = parseInt(userStats[quest.stat]) || 0; 
                if (currentProgress < quest.goal) return i.editReply({ content: `❌ لم تنجز المهمة بعد! تقدمك: ${currentProgress}/${quest.goal}` }).catch(()=>{});

                sql.transaction(() => {
                    sql.prepare("INSERT INTO user_quest_claims (claimID, userID, guildID, questID, dateStr) VALUES (?, ?, ?, ?, ?)").run(claimId, userId, guildId, quest.id, dateKey);
                    if (quest.repReward && quest.repReward > 0) sql.prepare("INSERT INTO user_reputation (userID, guildID, rep_points) VALUES (?, ?, ?) ON CONFLICT(userID, guildID) DO UPDATE SET rep_points = CAST(rep_points AS INTEGER) + ?").run(userId, guildId, quest.repReward, quest.repReward);
                    
                    let userLevel = sql.prepare("SELECT * FROM levels WHERE user = ? AND guild = ?").get(userId, guildId);
                    if (userLevel) {
                        userLevel.mora = parseInt(userLevel.mora) + quest.reward.mora; userLevel.xp = parseInt(userLevel.xp) + quest.reward.xp;
                        if (client.setLevel) client.setLevel.run(userLevel);
                        else sql.prepare("UPDATE levels SET mora = ?, xp = ? WHERE user = ? AND guild = ?").run(userLevel.mora, userLevel.xp, userId, guildId);
                    }
                })();

                let msg = `🎉 **مبارك!** أكملت "${quest.name}" وحصلت على: 💰 **${quest.reward.mora}** | ✨ **${quest.reward.xp}**`;
                if (quest.repReward) msg += ` | 🌟 **+${quest.repReward}** سمعة!`;
                return i.editReply({ content: msg }).catch(()=>{});
            }

            if (rawId.startsWith('claim_ach_')) {
                const achId = rawId.replace('claim_ach_', '');
                const ach = questsConfig.achievements.find(a => a.id === achId);
                if (!ach) return i.editReply({ content: '❌ الإنجاز غير موجود.' }).catch(()=>{});

                const isClaimed = sql.prepare("SELECT 1 FROM user_achievements WHERE userID = ? AND guildID = ? AND achievementID = ?").get(userId, guildId, ach.id);
                if (isClaimed) return i.editReply({ content: '⚠️ لقد قمت باستلام هذا الوسام مسبقا!' }).catch(()=>{});

                const currentProgress = getUserStat(userId, guildId, ach.stat, sql);
                if (currentProgress < ach.goal) return i.editReply({ content: `❌ الإنجاز مقفل! تقدمك: ${currentProgress}/${ach.goal}` }).catch(()=>{});

                sql.transaction(() => {
                    sql.prepare("INSERT INTO user_achievements (userID, guildID, achievementID, timestamp) VALUES (?, ?, ?, ?)").run(userId, guildId, ach.id, Date.now());
                    if (ach.repReward && ach.repReward > 0) sql.prepare("INSERT INTO user_reputation (userID, guildID, rep_points) VALUES (?, ?, ?) ON CONFLICT(userID, guildID) DO UPDATE SET rep_points = CAST(rep_points AS INTEGER) + ?").run(userId, guildId, ach.repReward, ach.repReward);
                    
                    let userLevel = sql.prepare("SELECT * FROM levels WHERE user = ? AND guild = ?").get(userId, guildId);
                    if (userLevel) {
                        userLevel.mora = parseInt(userLevel.mora) + ach.reward.mora; userLevel.xp = parseInt(userLevel.xp) + ach.reward.xp;
                        if (client.setLevel) client.setLevel.run(userLevel);
                        else sql.prepare("UPDATE levels SET mora = ?, xp = ? WHERE user = ? AND guild = ?").run(userLevel.mora, userLevel.xp, userId, guildId);
                    }
                })();

                let msg = `🏅 **وسام عظيم!** استلمت "${ach.name}" وحصلت على: 💰 **${ach.reward.mora}** | ✨ **${ach.reward.xp}**`;
                if (ach.repReward) msg += ` | 🌟 **+${ach.repReward}** سمعة!`;
                return i.editReply({ content: msg }).catch(()=>{});
            }
        } catch (err) {
            return i.editReply({ content: '❌ حدث خطأ أثناء تسليم الجائزة.' }).catch(()=>{});
        }
        return; 
    }

    if (i.isStringSelectMenu()) await i.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(()=>{}); 
    else if (i.isButton()) await i.deferUpdate().catch(()=>{}); 

    let currentPage = 1;
    let section = "unknown";

    if (rawId.includes('_prev_')) {
        let parts = rawId.split('_prev_');
        section = parts[0].replace('panel_', '');
        currentPage = parseInt(parts[1]) - 1;
    } else if (rawId.includes('_next_')) {
        let parts = rawId.split('_next_');
        section = parts[0].replace('panel_', '');
        currentPage = parseInt(parts[1]) + 1;
    } else {
        section = rawId.replace('panel_', '');
    }

    if (section === 'daily_quests') section = 'daily';
    if (section === 'weekly_quests') section = 'weekly';
    if (section.includes('notif')) section = 'notifications';

    if (section === 'empire') {
         return i.editReply({ content: "🚧 **قسم مهام الإمبراطورية قيد التطوير حاليا!**", embeds: [], components: [] }).catch(()=>{});
    }

    if (section === 'notifications') {
        let notifData = sql.prepare("SELECT * FROM quest_notifications WHERE id = ?").get(id);
        if (!notifData) {
            notifData = { id: id, userID: userId, guildID: guildId, dailyNotif: 1, weeklyNotif: 1, achievementsNotif: 1, levelNotif: 1, kingsNotif: 1, badgesNotif: 1 };
            try { 
                sql.prepare("INSERT INTO quest_notifications (id, userID, guildID, dailyNotif, weeklyNotif, achievementsNotif, levelNotif, kingsNotif, badgesNotif) VALUES (@id, @userID, @guildID, @dailyNotif, @weeklyNotif, @achievementsNotif, @levelNotif, @kingsNotif, @badgesNotif)").run(notifData);
            } catch(e) {}
        }

        if (rawId.includes('toggle_notif')) {
            if (rawId.includes('daily')) notifData.dailyNotif = notifData.dailyNotif ? 0 : 1;
            else if (rawId.includes('weekly')) notifData.weeklyNotif = notifData.weeklyNotif ? 0 : 1;
            else if (rawId.includes('ach')) notifData.achievementsNotif = notifData.achievementsNotif ? 0 : 1;
            else if (rawId.includes('level')) notifData.levelNotif = notifData.levelNotif ? 0 : 1;
            else if (rawId.includes('kings')) notifData.kingsNotif = notifData.kingsNotif ? 0 : 1;
            else if (rawId.includes('badges')) notifData.badgesNotif = notifData.badgesNotif ? 0 : 1;
            
            try { 
                sql.prepare("UPDATE quest_notifications SET dailyNotif=?, weeklyNotif=?, achievementsNotif=?, levelNotif=?, kingsNotif=?, badgesNotif=? WHERE id=?").run(notifData.dailyNotif, notifData.weeklyNotif, notifData.achievementsNotif, notifData.levelNotif, notifData.kingsNotif, notifData.badgesNotif, id);
            } catch(e) {}
        }

        const buffer = await generateNotificationControlPanel(i.member);
        const attachment = new AttachmentBuilder(buffer, { name: 'notification-panel.png' });

        const notifButtonsRow1 = new ActionRowBuilder().addComponents(
            createNotifButton('المـهـام اليـوميـة', 'panel_toggle_notif_daily', notifData.dailyNotif),
            createNotifButton('المـهـام الاسـبوعيـة', 'panel_toggle_notif_weekly', notifData.weeklyNotif),
            createNotifButton('اشعـارات اللفـل', 'panel_toggle_notif_level', notifData.levelNotif)
        );
        
        const notifButtonsRow2 = new ActionRowBuilder().addComponents(
            createNotifButton('اشعـارات الانجـازات', 'panel_toggle_notif_ach', notifData.achievementsNotif),
            createNotifButton('اشعـارات الاوسـمـة', 'panel_toggle_notif_badges', notifData.badgesNotif),
            createNotifButton('اشعـارات الملـوك', 'panel_toggle_notif_kings', notifData.kingsNotif)
        );

        return i.editReply({ embeds: [], components: [notifButtonsRow1, notifButtonsRow2], files: [attachment] }).catch(()=>{});
    }

    let levelData = { user: userId, guild: guildId, level: 1, mora: 0, bank: 0, xp: 0 };
    if (client.getLevel) levelData = client.getLevel.get(userId, guildId) || levelData;

    let dailyStats = {}; let weeklyStats = {}; let totalStats = {};
    if (client.getDailyStats) dailyStats = client.getDailyStats.get(`${userId}-${guildId}-${todayStr}`) || {};
    if (client.getWeeklyStats) weeklyStats = client.getWeeklyStats.get(`${userId}-${guildId}-${weekStr}`) || {};
    if (client.getTotalStats) totalStats = client.getTotalStats.get(`${userId}-${guildId}`) || {};
    
    const completedAchievements = sql.prepare("SELECT * FROM user_achievements WHERE userID = ? AND guildID = ?").all(userId, guildId);

    let embeds = []; let files = []; let totalPages = 1; let data; let buttons = [];

    if (section === 'daily') {
        data = await buildDailyEmbed(sql, i.member, dailyStats, currentPage);
        getRotatedQuests(questsConfig.daily, 3, 2, todayStr).forEach(q => {
            if (q.repReward && q.repReward > 0 && Math.min(parseInt(dailyStats[q.stat]) || 0, q.goal) >= q.goal) {
                if (!sql.prepare("SELECT 1 FROM user_quest_claims WHERE claimID = ?").get(`${userId}-${guildId}-${q.id}-${todayStr}`)) {
                    buttons.push(new ButtonBuilder().setCustomId(`claim_quest_daily_${q.id}`).setLabel(`استلام سمعة: ${q.name}`).setStyle(ButtonStyle.Success));
                }
            }
        });
    } 
    else if (section === 'weekly') {
        data = await buildWeeklyEmbed(sql, i.member, weeklyStats, currentPage);
        getRotatedQuests(questsConfig.weekly, 2, 2, weekStr).forEach(q => {
            if (q.repReward && q.repReward > 0 && Math.min(parseInt(weeklyStats[q.stat]) || 0, q.goal) >= q.goal) {
                if (!sql.prepare("SELECT 1 FROM user_quest_claims WHERE claimID = ?").get(`${userId}-${guildId}-${q.id}-${weekStr}`)) {
                    buttons.push(new ButtonBuilder().setCustomId(`claim_quest_weekly_${q.id}`).setLabel(`استلام سمعة: ${q.name}`).setStyle(ButtonStyle.Success));
                }
            }
        });
    } 
    else if (section === 'achievements') { 
        data = await buildAchievementsEmbed(sql, i.member, levelData, totalStats, completedAchievements, currentPage);
    } 
    else if (section === 'my_achievements') {
        data = await buildMyAchievementsEmbed(i, sql, currentPage);
    } 
    else if (section === 'top_achievements') {
        // 🔥 هنا استدعينا الدالة الجديدة اللي أضفناها لتوب الإنجازات
        const lbData = await fetchLeaderboardData(client, sql, i.guild, 'achievements', currentPage, null);
        if (lbData && lbData.imageBuffer) {
            const attachment = new AttachmentBuilder(lbData.imageBuffer, { name: 'top_achievements.png' });
            data = { embeds: [], files: [attachment], totalPages: lbData.totalPages };
        } else {
            data = { embeds: [new EmbedBuilder().setTitle('خطأ').setDescription('❌ لا توجد بيانات لعرضها.').setColor(Colors.Red)], files: [], totalPages: 1 };
        }
    } 
    else if (section === 'adventurer_card') {
        try {
            const pvpCore = require('./pvp-core.js'); 
            const repData = sql.prepare("SELECT rep_points FROM user_reputation WHERE userID = ? AND guildID = ?").get(userId, guildId) || { rep_points: 0 };
            const points = parseInt(repData.rep_points) || 0;
            const rankInfo = getRepRankInfo(points);

            const userRaceData = pvpCore.getUserRace(i.member, sql);
            const raceName = userRaceData ? (RACE_TRANSLATIONS.get(userRaceData.raceName) || userRaceData.raceName) : "مجهول";
            const weaponData = pvpCore.getWeaponData(sql, i.member);
            const weaponName = weaponData ? weaponData.name : "بدون سلاح";
            const weaponDmg = weaponData ? weaponData.currentDamage : 0;
            const maxHp = 100 + (parseInt(levelData.level) * 4);

            const { calculateBuffMultiplier, calculateMoraBuff } = require("../streak-handler.js");
            const streakData = sql.prepare("SELECT * FROM streaks WHERE guildID = ? AND userID = ?").get(guildId, userId);
            const streakCount = streakData ? (parseInt(streakData.streakCount) || 0) : 0;
            let hasItemShields = streakData ? (parseInt(streakData.hasItemShield) || 0) : 0;
            let hasGraceShield = (streakData && parseInt(streakData.hasGracePeriod) === 1) ? 1 : 0;
            const totalShields = hasItemShields + hasGraceShield;

            const xpBuffPercent = Math.floor((calculateBuffMultiplier(i.member, sql) - 1) * 100);
            const moraBuffPercent = Math.floor((calculateMoraBuff(i.member, sql) - 1) * 100);

            const totalMora = (parseInt(levelData.mora) || 0) + (parseInt(levelData.bank) || 0);
            let displayMora = totalMora.toLocaleString();
            if (userId === OWNER_ID) displayMora = "👁️";

            let ranks = { level: "0", mora: "0", streak: "0", power: "0" };
            if (userId !== OWNER_ID) {
                const allScores = sql.prepare("SELECT user FROM levels WHERE guild = ? AND user != ? ORDER BY CAST(totalXP AS INTEGER) DESC").all(guildId, OWNER_ID);
                let rLvl = allScores.findIndex(s => s.user === userId) + 1;
                ranks.level = rLvl > 0 ? rLvl.toString() : "0";

                const allMora = sql.prepare("SELECT user FROM levels WHERE guild = ? AND user != ? ORDER BY (CAST(mora AS INTEGER) + CAST(bank AS INTEGER)) DESC").all(guildId, OWNER_ID);
                let rMora = allMora.findIndex(s => s.user === userId) + 1;
                ranks.mora = rMora > 0 ? rMora.toString() : "0";

                const allStreaks = sql.prepare("SELECT userID FROM streaks WHERE guildID = ? AND userID != ? ORDER BY CAST(streakCount AS INTEGER) DESC").all(guildId, OWNER_ID);
                let rStreak = allStreaks.findIndex(s => s.userID === userId) + 1;
                ranks.streak = rStreak > 0 ? rStreak.toString() : "0";

                let rPower = calculateStrongestRank(sql, guildId, userId);
                ranks.power = rPower > 0 ? rPower.toString() : "0";
            }

            const currentXP = parseInt(levelData.xp) || 0;
            const requiredXP = 5 * (parseInt(levelData.level) ** 2) + (50 * parseInt(levelData.level)) + 100;

            const profileData = {
                user: i.user,
                displayName: i.member.displayName || i.user.username,
                rankInfo: rankInfo,
                repPoints: points,
                level: parseInt(levelData.level),
                currentXP: currentXP,
                requiredXP: requiredXP,
                mora: displayMora,
                raceName: raceName,
                weaponName: weaponName,
                weaponDmg: weaponDmg,
                maxHp: maxHp,
                streakCount: streakCount,
                xpBuff: xpBuffPercent,
                moraBuff: moraBuffPercent,
                shields: totalShields,
                ranks: ranks
            };

            const buffer = await generateAdventurerCard(profileData);
            const attachment = new AttachmentBuilder(buffer, { name: 'adventurer_card.png' });
            data = { embeds: [], files: [attachment], totalPages: 1 };
        } catch (err) {
            return i.editReply({ content: "❌ حدث خطأ أثناء إنشاء البطاقة." }).catch(()=>{});
        }
    } 
    else if (section === 'hall_of_fame') {
        try {
            const topUsers = sql.prepare("SELECT userID, CAST(rep_points AS INTEGER) as rp FROM user_reputation WHERE guildID = ? AND CAST(rep_points AS INTEGER) > 0 ORDER BY rp DESC LIMIT 10").all(guildId);
            
            let topUsersData = [];
            for (const u of topUsers) {
                try {
                    const member = await i.guild.members.fetch(u.userID).catch(()=>null);
                    let displayName = "مغامر مجهول"; let avatarUrl = null;
                    if (member) {
                        displayName = member.displayName; avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 128 });
                    } else {
                        const fetchedUser = await client.users.fetch(u.userID).catch(()=>null);
                        if (fetchedUser) { displayName = fetchedUser.username; avatarUrl = fetchedUser.displayAvatarURL({ extension: 'png', size: 128 }); }
                    }
                    const rankInfo = getRepRankInfo(u.rp);
                    const rankLetter = rankInfo.name.match(/[A-Z]+/) ? rankInfo.name.match(/[A-Z]+/)[0] : 'F';
                    topUsersData.push({ displayName: displayName, avatarUrl: avatarUrl, repPoints: u.rp, rankLetter: rankLetter });
                } catch (err) {}
            }

            const buffer = await generateHallOfFame(topUsersData);
            const attachment = new AttachmentBuilder(buffer, { name: 'hall_of_fame.png' });
            data = { embeds: [], files: [attachment], totalPages: 1 };
        } catch (error) {
            return i.editReply({ content: "❌ حدث خطأ أثناء تجهيز قاعة الأساطير.", ephemeral: true }).catch(()=>{});
        }
    } 
    else {
        return i.editReply({ content: `❌ القسم غير معروف.` }).catch(()=>{});
    }

    if (data) {
        if (data.embeds) {
            embeds = Array.isArray(data.embeds) ? data.embeds : [data.embeds];
        } else if (data.embed) {
            embeds = [data.embed];
        } else {
            embeds = [];
        }
        
        files = data.files || [];
        totalPages = data.totalPages || 1;
        currentPage = Math.max(1, Math.min(currentPage, totalPages)); 
    }

    let components = [];
    if (buttons.length > 0) {
        components.push(...chunkButtons(buttons.slice(0, 20))); 
    }

    if (totalPages > 1 && !['adventurer_card', 'hall_of_fame', 'top_achievements'].includes(section)) {
        if (components.length < 5) {
            const pageRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`panel_${section}_prev_${currentPage}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('<:left:1439164494759723029>')
                    .setDisabled(currentPage === 1),
                new ButtonBuilder()
                    .setCustomId(`panel_${section}_next_${currentPage}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('<:right:1439164491072929915>')
                    .setDisabled(currentPage === totalPages)
            );
            components.push(pageRow);
        }
    }

    await i.editReply({ content: embeds.length === 0 && files.length === 0 ? "❌ لا توجد بيانات." : null, embeds: embeds, files: files, components: components }).catch(()=>{});
}

const lastKingsHash = new Map();

async function autoUpdateKingsBoard(client, sql) {
    if (!sql.open) return;

    for (const guild of client.guilds.cache.values()) {
        const guildId = guild.id;
        try {
            const settings = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(guildId);
            if (!settings || !settings.guildBoardChannelID || !settings.kingsBoardMessageID) continue; 

            const todayStr = getTodayDateString();

            const casinoData = sql.prepare(`SELECT userID, SUM(CAST(COALESCE(casino_profit, 0) AS INTEGER) + CAST(COALESCE(mora_earned, 0) AS INTEGER)) as val FROM kings_board_tracker WHERE guildID = ? AND date = ? GROUP BY userID HAVING val > 0 ORDER BY val DESC LIMIT 1`).get(guildId, todayStr);
            const abyssData = sql.prepare(`SELECT user AS userID, CAST(max_dungeon_floor AS INTEGER) as val FROM levels WHERE guild = ? AND CAST(max_dungeon_floor AS INTEGER) > 0 ORDER BY val DESC LIMIT 1`).get(guildId);
            const chatterData = sql.prepare(`SELECT userID, SUM(CAST(COALESCE(messages, 0) AS INTEGER)) as val FROM kings_board_tracker WHERE guildID = ? AND date = ? GROUP BY userID HAVING val > 0 ORDER BY val DESC LIMIT 1`).get(guildId, todayStr);
            const philanData = sql.prepare(`SELECT userID, SUM(CAST(COALESCE(mora_donated, 0) AS INTEGER)) as val FROM kings_board_tracker WHERE guildID = ? AND date = ? GROUP BY userID HAVING val > 0 ORDER BY val DESC LIMIT 1`).get(guildId, todayStr);
            const advisorData = sql.prepare(`SELECT userID, SUM(CAST(COALESCE(ai_interactions, 0) AS INTEGER)) as val FROM kings_board_tracker WHERE guildID = ? AND date = ? GROUP BY userID HAVING val > 0 ORDER BY val DESC LIMIT 1`).get(guildId, todayStr);
            const fisherData = sql.prepare(`SELECT userID, SUM(CAST(COALESCE(fish_caught, 0) AS INTEGER)) as val FROM kings_board_tracker WHERE guildID = ? AND date = ? GROUP BY userID HAVING val > 0 ORDER BY val DESC LIMIT 1`).get(guildId, todayStr);
            const pvpData = sql.prepare(`SELECT userID, SUM(CAST(COALESCE(pvp_wins, 0) AS INTEGER)) as val FROM kings_board_tracker WHERE guildID = ? AND date = ? GROUP BY userID HAVING val > 0 ORDER BY val DESC LIMIT 1`).get(guildId, todayStr);
            const farmData = sql.prepare(`SELECT userID, SUM(CAST(COALESCE(crops_harvested, 0) AS INTEGER)) as val FROM kings_board_tracker WHERE guildID = ? AND date = ? GROUP BY userID HAVING val > 0 ORDER BY val DESC LIMIT 1`).get(guildId, todayStr);

            const currentHashArray = [
                casinoData ? `${casinoData.userID}:${casinoData.val}` : 'none',
                abyssData ? `${abyssData.userID}:${abyssData.val}` : 'none',
                chatterData ? `${chatterData.userID}:${chatterData.val}` : 'none',
                philanData ? `${philanData.userID}:${philanData.val}` : 'none',
                advisorData ? `${advisorData.userID}:${advisorData.val}` : 'none',
                fisherData ? `${fisherData.userID}:${fisherData.val}` : 'none',
                pvpData ? `${pvpData.userID}:${pvpData.val}` : 'none',
                farmData ? `${farmData.userID}:${farmData.val}` : 'none'
            ];
            
            const currentHash = currentHashArray.join('|');
            const oldHash = lastKingsHash.get(guildId);

            if (oldHash === currentHash) continue; 

            const boardChannel = guild.channels.cache.get(settings.guildBoardChannelID);
            const announceChannel = settings.guildAnnounceChannelID ? guild.channels.cache.get(settings.guildAnnounceChannelID) : null;

            if (boardChannel) {
                try {
                    const kingsMsg = await boardChannel.messages.fetch(settings.kingsBoardMessageID);
                    
                    async function getKingInfo(dataObj, suffix, title, emoji) {
                        if (!dataObj) return { title, emoji, displayName: 'لا أحد حتى الآن', avatarUrl: null, valueText: `0 ${suffix}` };
                        try {
                            let member = await guild.members.fetch(dataObj.userID).catch(()=>null);
                            let user = member ? member.user : await client.users.fetch(dataObj.userID).catch(()=>null);
                            if (user) {
                                return {
                                    title, emoji,
                                    displayName: member ? member.displayName : user.username,
                                    avatarUrl: user.displayAvatarURL({ extension: 'png', size: 128 }),
                                    valueText: `${parseInt(dataObj.val).toLocaleString()} ${suffix}`
                                };
                            }
                        } catch (e) {}
                        return { title, emoji, displayName: 'مغامر مجهول', avatarUrl: null, valueText: `${parseInt(dataObj.val).toLocaleString()} ${suffix}` };
                    }

                    const kingsArray = [
                        await getKingInfo(casinoData, 'مورا', 'ملك الكازينو', '🎰'),
                        await getKingInfo(abyssData, 'طابق', 'ملك الهاوية', '🌑'),
                        await getKingInfo(chatterData, 'رسالة', 'ملك البلاغة', '🗣️'), 
                        await getKingInfo(philanData, 'مورا', 'ملك الكرم', '🤝'),
                        await getKingInfo(advisorData, 'تفاعل', 'ملك الحكمة', '🧠'),
                        await getKingInfo(fisherData, 'سمكة', 'ملك القنص', '🎣'),
                        await getKingInfo(pvpData, 'انتصار', 'ملك النزاع', '⚔️'),
                        await getKingInfo(farmData, 'محصول', 'ملك الحصاد', '🌾')
                    ];

                    const kingsBoardBuffer = await generateKingsBoardImage(kingsArray);
                    const kingsBoardAttachment = new AttachmentBuilder(kingsBoardBuffer, { name: `kings-board-${Date.now()}.png` });
                    await kingsMsg.edit({ files: [kingsBoardAttachment] });

                    if (oldHash) {
                        const oldParts = oldHash.split('|');
                        const titles = ['ملك الكازينو', 'ملك الهاوية', 'ملك البلاغة', 'ملك الكرم', 'ملك الحكمة', 'ملك القنص', 'ملك النزاع', 'ملك الحصاد'];
                        const suffixes = ['مورا', 'طابق', 'رسالة', 'مورا', 'تفاعل', 'سمكة', 'انتصار', 'محصول'];
                        const colors = ['#FFD700', '#9D00FF', '#00BFFF', '#FF8C00', '#00FF88', '#00CED1', '#DC143C', '#32CD32'];
                        const roleCols = ['roleCasinoKing', 'roleAbyss', 'roleChatter', 'rolePhilanthropist', 'roleAdvisor', 'roleFisherKing', 'rolePvPKing', 'roleFarmKing'];

                        for (let i = 0; i < 8; i++) {
                            if (oldParts[i] !== currentHashArray[i] && currentHashArray[i] !== 'none') {
                                const [newUserId, newVal] = currentHashArray[i].split(':');
                                const [oldUserId] = oldParts[i] === 'none' ? [null] : oldParts[i].split(':');

                                if (newUserId !== oldUserId) {
                                    const roleId = settings[roleCols[i]];
                                    if (roleId) {
                                        const targetRole = guild.roles.cache.get(roleId);
                                        if (targetRole) {
                                            targetRole.members.forEach(async (member) => {
                                                if (member.id !== newUserId) await member.roles.remove(targetRole).catch(() => {});
                                            });
                                            if (newUserId !== 'none') {
                                                const newKingMem = await guild.members.fetch(newUserId).catch(() => null);
                                                if (newKingMem && !newKingMem.roles.cache.has(roleId)) await newKingMem.roles.add(targetRole).catch(() => {});
                                            }
                                        }
                                    }

                                    if (newUserId !== 'none') {
                                        const notifData = sql.prepare("SELECT kingsNotif FROM quest_notifications WHERE id = ?").get(`${newUserId}-${guildId}`);
                                        if (!notifData || notifData.kingsNotif !== 0) {
                                            const kingMsgContent = announcementsTexts.getKingMessage(`<@${newUserId}>`, titles[i], `${parseInt(newVal).toLocaleString()} ${suffixes[i]}`, client);
                                            
                                            if (announceChannel) {
                                                let files = [];
                                                if (announceChannel.permissionsFor(guild.members.me)?.has(PermissionsBitField.Flags.AttachFiles)) {
                                                    try {
                                                        const newKingUser = await client.users.fetch(newUserId).catch(()=>null);
                                                        let oldUserObj = 'EMPTY';
                                                        if (oldUserId && oldUserId !== 'none') {
                                                            const oldMem = await guild.members.fetch(oldUserId).catch(()=>null);
                                                            if (oldMem) oldUserObj = oldMem.user;
                                                        }
                                                        
                                                        const description = oldUserObj === 'EMPTY' ? `اعتلى العرش بكل جدارة!` : `انتزع التاج بقوة واعتلى القمة!`;

                                                        if (newKingUser) {
                                                            const buffer = await generateEpicAnnouncement(newKingUser, '👑 انـتـزاع عـرش 👑', titles[i], description, `الرقم القياسي: ${parseInt(newVal).toLocaleString()} ${suffixes[i]}`, colors[i], oldUserObj, true);
                                                            files.push(new AttachmentBuilder(buffer, { name: `new-king-${Date.now()}.png` }));
                                                        }
                                                    } catch(e) {}
                                                }
                                                await announceChannel.send({ content: kingMsgContent, files: files }).catch(()=>{});
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                } catch (err) {}
            }
            
            lastKingsHash.set(guildId, currentHash);
        } catch (err) {}
    }
}

async function updateGuildStat(client, guildId, userId, statName, valueToAdd) {
    try {
        const sql = client.sql;
        ensureKingTrackerTable(sql);

        const todayStr = getTodayDateString(); 
        const addedVal = parseInt(valueToAdd) || 0;
        
        if (addedVal === 0 && statName !== 'max_dungeon_floor') return;

        if (statName === 'max_dungeon_floor') {
            sql.prepare(`
                INSERT INTO levels (id, user, guild, max_dungeon_floor) 
                VALUES (?, ?, ?, ?) 
                ON CONFLICT(id) DO UPDATE SET max_dungeon_floor = MAX(COALESCE(max_dungeon_floor, 0), ?)
            `).run(`${guildId}-${userId}`, userId, guildId, addedVal, addedVal);
        } else {
            const dailyID = `${userId}-${guildId}-${todayStr}`;
            
            sql.prepare(`
                INSERT INTO kings_board_tracker (id, userID, guildID, date, ${statName}) 
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET ${statName} = COALESCE(kings_board_tracker.${statName}, 0) + ?
            `).run(dailyID, userId, guildId, todayStr, addedVal, addedVal);

            try {
                sql.prepare(`
                    INSERT INTO user_daily_stats (id, userID, guildID, date, ${statName}) 
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET ${statName} = COALESCE(user_daily_stats.${statName}, 0) + ?
                `).run(dailyID, userId, guildId, todayStr, addedVal, addedVal);
            } catch(e){}
        }
    } catch (error) {}
}

module.exports = { handleQuestPanel, handleGuildBoard: handleQuestPanel, autoUpdateKingsBoard, updateGuildStat };
