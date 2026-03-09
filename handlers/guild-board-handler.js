const { EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags, AttachmentBuilder, PermissionsBitField } = require("discord.js");
const { buildAchievementsEmbed, buildDailyEmbed, buildWeeklyEmbed } = require('../commands/achievements.js');
const { fetchLeaderboardData } = require('../commands/top.js'); 
const questsConfig = require('../json/quests-config.json');
const weaponsConfig = require('../json/weapons-config.json');

const { generateAdventurerCard } = require('../generators/adventurer-card-generator.js'); 
const { generateHallOfFame } = require('../generators/hall-of-fame-generator.js');
const { generateGuideImage } = require('../generators/guide-generator.js'); 
const { generateKingsBoardImage } = require('../generators/guild-boards-generator.js');
const { generateEpicAnnouncement } = require('../generators/announcement-generator.js');
const { generateNotificationControlPanel } = require('../generators/notification-generator.js');
const { generateAchievementCard } = require('../generators/achievement-card-generator.js');

let generateKingsAnnouncementImage;
try {
    generateKingsAnnouncementImage = require('../generators/kings-reward-generator.js').generateKingsAnnouncementImage;
} catch (e) {
    console.error("يرجى التأكد من إضافة ملف kings-reward-generator.js");
}

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

async function ensureKingTrackerTable(db) {
    try {
        await db.query(`CREATE TABLE IF NOT EXISTS kings_board_tracker (
            id TEXT PRIMARY KEY,
            userid TEXT,
            guildid TEXT,
            date TEXT,
            casino_profit INTEGER DEFAULT 0,
            mora_earned INTEGER DEFAULT 0,
            messages INTEGER DEFAULT 0,
            mora_donated INTEGER DEFAULT 0,
            ai_interactions INTEGER DEFAULT 0,
            fish_caught INTEGER DEFAULT 0,
            pvp_wins INTEGER DEFAULT 0,
            crops_harvested INTEGER DEFAULT 0
        )`);
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

async function getUserStat(userId, guildId, statName, db) {
    let val = 0;
    try {
        const lvlRes = await db.query('SELECT * FROM levels WHERE "user" = $1 AND guild = $2', [userId, guildId]);
        const lvlData = lvlRes.rows[0];
        if (lvlData && lvlData[statName.toLowerCase()] !== undefined) return parseInt(lvlData[statName.toLowerCase()]) || 0;
        
        const totalRes = await db.query("SELECT * FROM user_total_stats WHERE userid = $1 AND guildid = $2", [userId, guildId]);
        const totalData = totalRes.rows[0];
        if (totalData && totalData[statName.toLowerCase()] !== undefined) return parseInt(totalData[statName.toLowerCase()]) || 0;
        
        if (statName === 'highestStreak') {
             const streakRes = await db.query("SELECT higheststreak FROM streaks WHERE userid = $1 AND guildid = $2", [userId, guildId]);
             const streakData = streakRes.rows[0];
             return streakData ? (parseInt(streakData.higheststreak) || 0) : 0;
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

async function calculateStrongestRank(db, guildID, targetUserID) {
    if (targetUserID === OWNER_ID) return 0;
    const weaponsRes = await db.query("SELECT userid, racename, weaponlevel FROM user_weapons WHERE guildid = $1 AND userid != $2", [guildID, OWNER_ID]);
    const weapons = weaponsRes.rows;

    let stats = [];
    for (const w of weapons) {
        const conf = weaponsConfig.find(c => c.race === w.racename);
        if(!conf) continue;
        const dmg = conf.base_damage + (conf.damage_increment * (w.weaponlevel - 1));
        
        const lvlRes = await db.query('SELECT level FROM levels WHERE guild = $1 AND "user" = $2', [guildID, w.userid]);
        const lvlData = lvlRes.rows[0];
        const playerLevel = lvlData?.level || 1;
        
        const hp = 100 + (playerLevel * 4);
        
        const skillRes = await db.query("SELECT SUM(skilllevel) as totallevels FROM user_skills WHERE guildid = $1 AND userid = $2", [guildID, w.userid]);
        const skillData = skillRes.rows[0];
        const skillLevelsTotal = skillData ? (parseInt(skillData.totallevels) || 0) : 0;
        
        const powerScore = Math.floor(dmg + (hp * 0.5) + (playerLevel * 10) + (skillLevelsTotal * 20));
        stats.push({ userid: w.userid, powerScore });
    }
    stats.sort((a, b) => b.powerScore - a.powerScore);
    return stats.findIndex(s => s.userid === targetUserID) + 1; 
}

function chunkButtons(buttons) {
    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    return rows;
}

async function buildMyAchievementsEmbed(interaction, db, page = 1) {
    try {
        const completedRes = await db.query("SELECT * FROM user_achievements WHERE userid = $1 AND guildid = $2", [interaction.user.id, interaction.guild.id]);
        const completed = completedRes.rows;
        if (completed.length === 0) {
            return { 
                embeds: [new EmbedBuilder().setTitle('🎖️ إنجازاتي').setColor(Colors.DarkRed).setDescription('لم تقم بإكمال أي إنجازات بعد.').setImage('https://i.postimg.cc/L4Yb4zHw/almham_alywmyt-2.png')], 
                components: [], totalPages: 1 
            };
        }
        const completedIDs = new Set(completed.map(c => c.achievementid));
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

async function handleQuestPanel(i, client, db) {
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
                const isClaimedRes = await db.query("SELECT 1 FROM user_quest_claims WHERE claimid = $1", [claimId]);
                if (isClaimedRes.rows.length > 0) return i.editReply({ content: '⚠️ لقد قمت باستلام الجائزة مسبقا!' }).catch(()=>{});

                const table = isDaily ? 'user_daily_stats' : 'user_weekly_stats';
                const dateCol = isDaily ? 'date' : 'weekstartdate';
                const userStatsRes = await db.query(`SELECT * FROM ${table} WHERE userid = $1 AND guildid = $2 AND ${dateCol} = $3`, [userId, guildId, dateKey]);
                const userStats = userStatsRes.rows[0] || {};
                
                const currentProgress = parseInt(userStats[quest.stat.toLowerCase()]) || 0; 
                if (currentProgress < quest.goal) return i.editReply({ content: `❌ لم تنجز المهمة بعد! تقدمك: ${currentProgress}/${quest.goal}` }).catch(()=>{});

                try {
                    await db.query("BEGIN");
                    await db.query("INSERT INTO user_quest_claims (claimid, userid, guildid, questid, datestr) VALUES ($1, $2, $3, $4, $5)", [claimId, userId, guildId, quest.id, dateKey]);
                    
                    if (quest.repReward && quest.repReward > 0) {
                        await db.query("INSERT INTO user_reputation (userid, guildid, rep_points) VALUES ($1, $2, $3) ON CONFLICT(userid, guildid) DO UPDATE SET rep_points = user_reputation.rep_points + $4", [userId, guildId, quest.repReward, quest.repReward]);
                    }
                    
                    const userLevelRes = await db.query('SELECT * FROM levels WHERE "user" = $1 AND guild = $2', [userId, guildId]);
                    if (userLevelRes.rows.length > 0) {
                        const currentMora = parseInt(userLevelRes.rows[0].mora) + quest.reward.mora;
                        const currentXP = parseInt(userLevelRes.rows[0].xp) + quest.reward.xp;
                        await db.query('UPDATE levels SET mora = $1, xp = $2 WHERE "user" = $3 AND guild = $4', [currentMora, currentXP, userId, guildId]);
                    }
                    await db.query("COMMIT");
                } catch (e) {
                    await db.query("ROLLBACK");
                    throw e;
                }

                let msg = `🎉 **مبارك!** أكملت "${quest.name}" وحصلت على: 💰 **${quest.reward.mora}** | ✨ **${quest.reward.xp}**`;
                if (quest.repReward) msg += ` | 🌟 **+${quest.repReward}** سمعة!`;
                return i.editReply({ content: msg }).catch(()=>{});
            }

            if (rawId.startsWith('claim_ach_')) {
                const achId = rawId.replace('claim_ach_', '');
                const ach = questsConfig.achievements.find(a => a.id === achId);
                if (!ach) return i.editReply({ content: '❌ الإنجاز غير موجود.' }).catch(()=>{});

                const isClaimedRes = await db.query("SELECT 1 FROM user_achievements WHERE userid = $1 AND guildid = $2 AND achievementid = $3", [userId, guildId, ach.id]);
                if (isClaimedRes.rows.length > 0) return i.editReply({ content: '⚠️ لقد قمت باستلام هذا الوسام مسبقا!' }).catch(()=>{});

                const currentProgress = await getUserStat(userId, guildId, ach.stat, db);
                if (currentProgress < ach.goal) return i.editReply({ content: `❌ الإنجاز مقفل! تقدمك: ${currentProgress}/${ach.goal}` }).catch(()=>{});

                try {
                    await db.query("BEGIN");
                    await db.query("INSERT INTO user_achievements (userid, guildid, achievementid, timestamp) VALUES ($1, $2, $3, $4)", [userId, guildId, ach.id, Date.now()]);
                    
                    if (ach.repReward && ach.repReward > 0) {
                        await db.query("INSERT INTO user_reputation (userid, guildid, rep_points) VALUES ($1, $2, $3) ON CONFLICT(userid, guildid) DO UPDATE SET rep_points = user_reputation.rep_points + $4", [userId, guildId, ach.repReward, ach.repReward]);
                    }
                    
                    const userLevelRes = await db.query('SELECT * FROM levels WHERE "user" = $1 AND guild = $2', [userId, guildId]);
                    if (userLevelRes.rows.length > 0) {
                        const currentMora = parseInt(userLevelRes.rows[0].mora) + ach.reward.mora;
                        const currentXP = parseInt(userLevelRes.rows[0].xp) + ach.reward.xp;
                        await db.query('UPDATE levels SET mora = $1, xp = $2 WHERE "user" = $3 AND guild = $4', [currentMora, currentXP, userId, guildId]);
                    }
                    await db.query("COMMIT");
                } catch (e) {
                    await db.query("ROLLBACK");
                    throw e;
                }

                const userAvatar = i.user.displayAvatarURL({ extension: 'png', size: 256 });
                const userName = i.member.displayName || i.user.username;
                
                try {
                    const buffer = await generateAchievementCard(userAvatar, userName, ach.name, ach.description, ach.reward.mora, ach.reward.xp, ach.repReward);
                    const attachment = new AttachmentBuilder(buffer, { name: 'achievement.png' });
                    return i.editReply({ content: `<@${userId}>`, files: [attachment] }).catch(()=>{});
                } catch(e) {
                    let fallbackMsg = `🏅 **وسام عظيم!** استلمت "${ach.name}" وحصلت على: 💰 **${ach.reward.mora}** | ✨ **${ach.reward.xp}**`;
                    if (ach.repReward) fallbackMsg += ` | 🌟 **+${ach.repReward}** سمعة!`;
                    return i.editReply({ content: fallbackMsg }).catch(()=>{});
                }
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
        const notifDataRes = await db.query("SELECT * FROM quest_notifications WHERE id = $1", [id]);
        let notifData = notifDataRes.rows[0];
        if (!notifData) {
            notifData = { id: id, userid: userId, guildid: guildId, dailynotif: 1, weeklynotif: 1, achievementsnotif: 1, levelnotif: 1, kingsnotif: 1, badgesnotif: 1 };
            try { 
                await db.query("INSERT INTO quest_notifications (id, userid, guildid, dailynotif, weeklynotif, achievementsnotif, levelnotif, kingsnotif, badgesnotif) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)", [id, userId, guildId, 1, 1, 1, 1, 1, 1]);
            } catch(e) {}
        }

        if (rawId.includes('toggle_notif')) {
            if (rawId.includes('daily')) notifData.dailynotif = notifData.dailynotif ? 0 : 1;
            else if (rawId.includes('weekly')) notifData.weeklynotif = notifData.weeklynotif ? 0 : 1;
            else if (rawId.includes('ach')) notifData.achievementsnotif = notifData.achievementsnotif ? 0 : 1;
            else if (rawId.includes('level')) notifData.levelnotif = notifData.levelnotif ? 0 : 1;
            else if (rawId.includes('kings')) notifData.kingsnotif = notifData.kingsnotif ? 0 : 1;
            else if (rawId.includes('badges')) notifData.badgesnotif = notifData.badgesnotif ? 0 : 1;
            
            try { 
                await db.query("UPDATE quest_notifications SET dailynotif=$1, weeklynotif=$2, achievementsnotif=$3, levelnotif=$4, kingsnotif=$5, badgesnotif=$6 WHERE id=$7", [notifData.dailynotif, notifData.weeklynotif, notifData.achievementsnotif, notifData.levelnotif, notifData.kingsnotif, notifData.badgesnotif, id]);
            } catch(e) {}
        }

        const buffer = await generateNotificationControlPanel(i.member);
        const attachment = new AttachmentBuilder(buffer, { name: 'notification-panel.png' });

        const notifButtonsRow1 = new ActionRowBuilder().addComponents(
            createNotifButton('المـهـام اليـوميـة', 'panel_toggle_notif_daily', notifData.dailynotif),
            createNotifButton('المـهـام الاسـبوعيـة', 'panel_toggle_notif_weekly', notifData.weeklynotif),
            createNotifButton('اشعـارات اللفـل', 'panel_toggle_notif_level', notifData.levelnotif)
        );
        
        const notifButtonsRow2 = new ActionRowBuilder().addComponents(
            createNotifButton('اشعـارات الانجـازات', 'panel_toggle_notif_ach', notifData.achievementsnotif),
            createNotifButton('اشعـارات الاوسـمـة', 'panel_toggle_notif_badges', notifData.badgesnotif),
            createNotifButton('اشعـارات الملـوك', 'panel_toggle_notif_kings', notifData.kingsnotif)
        );

        return i.editReply({ embeds: [], components: [notifButtonsRow1, notifButtonsRow2], files: [attachment] }).catch(()=>{});
    }

    const levelDataRes = await db.query('SELECT * FROM levels WHERE "user" = $1 AND guild = $2', [userId, guildId]);
    let levelData = levelDataRes.rows[0] || { userid: userId, guildid: guildId, level: 1, mora: 0, bank: 0, xp: 0 };

    const dailyStatsRes = await db.query("SELECT * FROM user_daily_stats WHERE id = $1", [`${userId}-${guildId}-${todayStr}`]);
    let dailyStats = dailyStatsRes.rows[0] || {};
    
    const weeklyStatsRes = await db.query("SELECT * FROM user_weekly_stats WHERE id = $1", [`${userId}-${guildId}-${weekStr}`]);
    let weeklyStats = weeklyStatsRes.rows[0] || {};
    
    const totalStatsRes = await db.query("SELECT * FROM user_total_stats WHERE userid = $1 AND guildid = $2", [userId, guildId]);
    let totalStats = totalStatsRes.rows[0] || {};
    
    const completedAchievementsRes = await db.query("SELECT * FROM user_achievements WHERE userid = $1 AND guildid = $2", [userId, guildId]);
    const completedAchievements = completedAchievementsRes.rows;

    let embeds = []; let files = []; let totalPages = 1; let data; let buttons = [];

    if (section === 'daily') {
        data = await buildDailyEmbed(db, i.member, dailyStats, currentPage);
        for (const q of getRotatedQuests(questsConfig.daily, 3, 2, todayStr)) {
            if (q.repReward && q.repReward > 0 && Math.min(parseInt(dailyStats[q.stat.toLowerCase()]) || 0, q.goal) >= q.goal) {
                const claimRes = await db.query("SELECT 1 FROM user_quest_claims WHERE claimid = $1", [`${userId}-${guildId}-${q.id}-${todayStr}`]);
                if (claimRes.rows.length === 0) {
                    buttons.push(new ButtonBuilder().setCustomId(`claim_quest_daily_${q.id}`).setLabel(`استلام سمعة: ${q.name}`).setStyle(ButtonStyle.Success));
                }
            }
        }
    } 
    else if (section === 'weekly') {
        data = await buildWeeklyEmbed(db, i.member, weeklyStats, currentPage);
        for (const q of getRotatedQuests(questsConfig.weekly, 2, 2, weekStr)) {
            if (q.repReward && q.repReward > 0 && Math.min(parseInt(weeklyStats[q.stat.toLowerCase()]) || 0, q.goal) >= q.goal) {
                const claimRes = await db.query("SELECT 1 FROM user_quest_claims WHERE claimid = $1", [`${userId}-${guildId}-${q.id}-${weekStr}`]);
                if (claimRes.rows.length === 0) {
                    buttons.push(new ButtonBuilder().setCustomId(`claim_quest_weekly_${q.id}`).setLabel(`استلام سمعة: ${q.name}`).setStyle(ButtonStyle.Success));
                }
            }
        }
    } 
    else if (section === 'achievements') { 
        data = await buildAchievementsEmbed(db, i.member, levelData, totalStats, completedAchievements, currentPage);
    } 
    else if (section === 'my_achievements') {
        data = await buildMyAchievementsEmbed(i, db, currentPage);
    } 
    else if (section === 'top_achievements') {
        const lbData = await fetchLeaderboardData(client, db, i.guild, 'achievements', currentPage, null);
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
            const repDataRes = await db.query("SELECT rep_points FROM user_reputation WHERE userid = $1 AND guildid = $2", [userId, guildId]);
            const repData = repDataRes.rows[0] || { rep_points: 0 };
            const points = parseInt(repData.rep_points) || 0;
            const rankInfo = getRepRankInfo(points);

            const userRaceData = await pvpCore.getUserRace(i.member, db);
            const raceName = userRaceData ? (RACE_TRANSLATIONS.get(userRaceData.racename) || userRaceData.racename) : "مجهول";
            const weaponData = await pvpCore.getWeaponData(db, i.member);
            const weaponName = weaponData ? weaponData.name : "بدون سلاح";
            const weaponDmg = weaponData ? weaponData.currentDamage : 0;
            const maxHp = 100 + (parseInt(levelData.level) * 4);

            const { calculateBuffMultiplier, calculateMoraBuff } = require("../streak-handler.js");
            const streakDataRes = await db.query("SELECT * FROM streaks WHERE guildid = $1 AND userid = $2", [guildId, userId]);
            const streakData = streakDataRes.rows[0];
            const streakCount = streakData ? (parseInt(streakData.streakcount) || 0) : 0;
            let hasItemShields = streakData ? (parseInt(streakData.hasitemshield) || 0) : 0;
            let hasGraceShield = (streakData && parseInt(streakData.hasgraceperiod) === 1) ? 1 : 0;
            const totalShields = hasItemShields + hasGraceShield;

            const xpBuffPercent = Math.floor((await calculateBuffMultiplier(i.member, db) - 1) * 100);
            const moraBuffPercent = Math.floor((await calculateMoraBuff(i.member, db) - 1) * 100);

            const totalMora = (parseInt(levelData.mora) || 0) + (parseInt(levelData.bank) || 0);
            let displayMora = totalMora.toLocaleString();
            if (userId === OWNER_ID) displayMora = "👁️";

            let ranks = { level: "0", mora: "0", streak: "0", power: "0" };
            if (userId !== OWNER_ID) {
                const allScoresRes = await db.query('SELECT "user" as userid FROM levels WHERE guild = $1 AND "user" != $2 ORDER BY totalxp DESC', [guildId, OWNER_ID]);
                const allScores = allScoresRes.rows;
                let rLvl = allScores.findIndex(s => s.userid === userId) + 1;
                ranks.level = rLvl > 0 ? rLvl.toString() : "0";

                const allMoraRes = await db.query('SELECT "user" as userid FROM levels WHERE guild = $1 AND "user" != $2 ORDER BY (mora + bank) DESC', [guildId, OWNER_ID]);
                const allMora = allMoraRes.rows;
                let rMora = allMora.findIndex(s => s.userid === userId) + 1;
                ranks.mora = rMora > 0 ? rMora.toString() : "0";

                const allStreaksRes = await db.query("SELECT userid FROM streaks WHERE guildid = $1 AND userid != $2 ORDER BY streakcount DESC", [guildId, OWNER_ID]);
                const allStreaks = allStreaksRes.rows;
                let rStreak = allStreaks.findIndex(s => s.userid === userId) + 1;
                ranks.streak = rStreak > 0 ? rStreak.toString() : "0";

                let rPower = await calculateStrongestRank(db, guildId, userId);
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
            const topUsersRes = await db.query("SELECT userid, rep_points as rp FROM user_reputation WHERE guildid = $1 AND rep_points > 0 ORDER BY rp DESC LIMIT 10", [guildId]);
            const topUsers = topUsersRes.rows;
            
            let topUsersData = [];
            for (const u of topUsers) {
                try {
                    const member = await i.guild.members.fetch(u.userid).catch(()=>null);
                    let displayName = "مغامر مجهول"; let avatarUrl = null;
                    if (member) {
                        displayName = member.displayName; avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 128 });
                    } else {
                        const fetchedUser = await client.users.fetch(u.userid).catch(()=>null);
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

async function autoUpdateKingsBoard(client, db) {
    if (!db) return;

    for (const guild of client.guilds.cache.values()) {
        const guildId = guild.id;
        try {
            const settingsRes = await db.query("SELECT * FROM settings WHERE guild = $1", [guildId]);
            const settings = settingsRes.rows[0];
            if (!settings || !settings.guildboardchannelid || !settings.kingsboardmessageid) continue; 

            const todayStr = getTodayDateString();

            const casinoDataRes = await db.query(`SELECT userid, SUM(COALESCE(casino_profit, 0) + COALESCE(mora_earned, 0)) as val FROM kings_board_tracker WHERE guildid = $1 AND date = $2 GROUP BY userid HAVING SUM(COALESCE(casino_profit, 0) + COALESCE(mora_earned, 0)) > 0 ORDER BY val DESC LIMIT 1`, [guildId, todayStr]);
            const casinoData = casinoDataRes.rows[0];
            
            // 🔥 تصحيح: استخدام "user" و guild
            const abyssDataRes = await db.query(`SELECT "user" as userid, max_dungeon_floor as val FROM levels WHERE guild = $1 AND max_dungeon_floor > 0 ORDER BY val DESC LIMIT 1`, [guildId]);
            const abyssData = abyssDataRes.rows[0];
            
            const chatterDataRes = await db.query(`SELECT userid, SUM(COALESCE(messages, 0)) as val FROM kings_board_tracker WHERE guildid = $1 AND date = $2 GROUP BY userid HAVING SUM(COALESCE(messages, 0)) > 0 ORDER BY val DESC LIMIT 1`, [guildId, todayStr]);
            const chatterData = chatterDataRes.rows[0];
            
            const philanDataRes = await db.query(`SELECT userid, SUM(COALESCE(mora_donated, 0)) as val FROM kings_board_tracker WHERE guildid = $1 AND date = $2 GROUP BY userid HAVING SUM(COALESCE(mora_donated, 0)) > 0 ORDER BY val DESC LIMIT 1`, [guildId, todayStr]);
            const philanData = philanDataRes.rows[0];
            
            const advisorDataRes = await db.query(`SELECT userid, SUM(COALESCE(ai_interactions, 0)) as val FROM kings_board_tracker WHERE guildid = $1 AND date = $2 GROUP BY userid HAVING SUM(COALESCE(ai_interactions, 0)) > 0 ORDER BY val DESC LIMIT 1`, [guildId, todayStr]);
            const advisorData = advisorDataRes.rows[0];
            
            const fisherDataRes = await db.query(`SELECT userid, SUM(COALESCE(fish_caught, 0)) as val FROM kings_board_tracker WHERE guildid = $1 AND date = $2 GROUP BY userid HAVING SUM(COALESCE(fish_caught, 0)) > 0 ORDER BY val DESC LIMIT 1`, [guildId, todayStr]);
            const fisherData = fisherDataRes.rows[0];
            
            const pvpDataRes = await db.query(`SELECT userid, SUM(COALESCE(pvp_wins, 0)) as val FROM kings_board_tracker WHERE guildid = $1 AND date = $2 GROUP BY userid HAVING SUM(COALESCE(pvp_wins, 0)) > 0 ORDER BY val DESC LIMIT 1`, [guildId, todayStr]);
            const pvpData = pvpDataRes.rows[0];
            
            const farmDataRes = await db.query(`SELECT userid, SUM(COALESCE(crops_harvested, 0)) as val FROM kings_board_tracker WHERE guildid = $1 AND date = $2 GROUP BY userid HAVING SUM(COALESCE(crops_harvested, 0)) > 0 ORDER BY val DESC LIMIT 1`, [guildId, todayStr]);
            const farmData = farmDataRes.rows[0];

            const currentHashArray = [
                casinoData ? `${casinoData.userid}:${casinoData.val}` : 'none',
                abyssData ? `${abyssData.userid}:${abyssData.val}` : 'none',
                chatterData ? `${chatterData.userid}:${chatterData.val}` : 'none',
                philanData ? `${philanData.userid}:${philanData.val}` : 'none',
                advisorData ? `${advisorData.userid}:${advisorData.val}` : 'none',
                fisherData ? `${fisherData.userid}:${fisherData.val}` : 'none',
                pvpData ? `${pvpData.userid}:${pvpData.val}` : 'none',
                farmData ? `${farmData.userid}:${farmData.val}` : 'none'
            ];
            
            const currentHash = currentHashArray.join('|');
            const oldHash = lastKingsHash.get(guildId);

            if (oldHash === currentHash) continue; 

            const boardChannel = guild.channels.cache.get(settings.guildboardchannelid);
            const announceChannel = settings.guildannouncechannelid ? guild.channels.cache.get(settings.guildannouncechannelid) : null;

            if (boardChannel) {
                try {
                    const kingsMsg = await boardChannel.messages.fetch(settings.kingsboardmessageid);
                    
                    async function getKingInfo(dataObj, suffix, title, emoji) {
                        if (!dataObj) return { title, emoji, displayName: 'لا أحد حتى الآن', avatarUrl: null, valueText: `0 ${suffix}` };
                        try {
                            let member = await guild.members.fetch(dataObj.userid).catch(()=>null);
                            let user = member ? member.user : await client.users.fetch(dataObj.userid).catch(()=>null);
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
                        await getKingInfo(farmData, 'مورا', 'ملك الحصاد', '🌾')
                    ];

                    const kingsBoardBuffer = await generateKingsBoardImage(kingsArray);
                    const kingsBoardAttachment = new AttachmentBuilder(kingsBoardBuffer, { name: `kings-board-${Date.now()}.png` });
                    await kingsMsg.edit({ files: [kingsBoardAttachment] });

                    if (oldHash) {
                        const oldParts = oldHash.split('|');
                        const titles = ['ملك الكازينو', 'ملك الهاوية', 'ملك البلاغة', 'ملك الكرم', 'ملك الحكمة', 'ملك القنص', 'ملك النزاع', 'ملك الحصاد'];
                        const suffixes = ['مورا', 'طابق', 'رسالة', 'مورا', 'تفاعل', 'سمكة', 'انتصار', 'مورا'];
                        const colors = ['#FFD700', '#9D00FF', '#00BFFF', '#FF8C00', '#00FF88', '#00CED1', '#DC143C', '#32CD32'];
                        const roleCols = ['rolecasinoking', 'roleabyss', 'rolechatter', 'rolephilanthropist', 'roleadvisor', 'rolefisherking', 'rolepvpking', 'rolefarmking'];

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
                                }

                                if (newUserId !== 'none') {
                                    const notifDataRes = await db.query("SELECT kingsnotif FROM quest_notifications WHERE id = $1", [`${newUserId}-${guildId}`]);
                                    const notifData = notifDataRes.rows[0];
                                    if (!notifData || notifData.kingsnotif !== 0) {
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

                } catch (err) {}
            }
            
            lastKingsHash.set(guildId, currentHash);
        } catch (err) {}
    }
}

async function rewardDailyKings(client, db) {
    if (!db) return;
    try {
        await db.query("CREATE TABLE IF NOT EXISTS kings_daily_payout (datestr TEXT PRIMARY KEY)");

        const yesterdayKSA = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Riyadh" }));
        yesterdayKSA.setDate(yesterdayKSA.getDate() - 1);
        const yesterdayStr = yesterdayKSA.toLocaleDateString('en-CA');

        const isPaidRes = await db.query("SELECT * FROM kings_daily_payout WHERE datestr = $1", [yesterdayStr]);
        if (isPaidRes.rows.length > 0) return; 

        for (const guild of client.guilds.cache.values()) {
            const guildId = guild.id;
            const settingsRes = await db.query("SELECT * FROM settings WHERE guild = $1", [guildId]);
            const settings = settingsRes.rows[0];
            if (!settings || !settings.guildannouncechannelid) continue;

            const casinoDataRes = await db.query(`SELECT userid FROM kings_board_tracker WHERE guildid = $1 AND date = $2 GROUP BY userid HAVING SUM(COALESCE(casino_profit, 0) + COALESCE(mora_earned, 0)) > 0 ORDER BY SUM(COALESCE(casino_profit, 0) + COALESCE(mora_earned, 0)) DESC LIMIT 1`, [guildId, yesterdayStr]);
            const casinoData = casinoDataRes.rows[0];
            
            // 🔥 تصحيح: استخدام "user" و guild
            const abyssDataRes = await db.query(`SELECT "user" as userid FROM levels WHERE guild = $1 AND max_dungeon_floor > 0 ORDER BY max_dungeon_floor DESC LIMIT 1`, [guildId]);
            const abyssData = abyssDataRes.rows[0];
            
            const chatterDataRes = await db.query(`SELECT userid FROM kings_board_tracker WHERE guildid = $1 AND date = $2 GROUP BY userid HAVING SUM(COALESCE(messages, 0)) > 0 ORDER BY SUM(COALESCE(messages, 0)) DESC LIMIT 1`, [guildId, yesterdayStr]);
            const chatterData = chatterDataRes.rows[0];
            const philanDataRes = await db.query(`SELECT userid FROM kings_board_tracker WHERE guildid = $1 AND date = $2 GROUP BY userid HAVING SUM(COALESCE(mora_donated, 0)) > 0 ORDER BY SUM(COALESCE(mora_donated, 0)) DESC LIMIT 1`, [guildId, yesterdayStr]);
            const philanData = philanDataRes.rows[0];
            const advisorDataRes = await db.query(`SELECT userid FROM kings_board_tracker WHERE guildid = $1 AND date = $2 GROUP BY userid HAVING SUM(COALESCE(ai_interactions, 0)) > 0 ORDER BY SUM(COALESCE(ai_interactions, 0)) DESC LIMIT 1`, [guildId, yesterdayStr]);
            const advisorData = advisorDataRes.rows[0];
            const fisherDataRes = await db.query(`SELECT userid FROM kings_board_tracker WHERE guildid = $1 AND date = $2 GROUP BY userid HAVING SUM(COALESCE(fish_caught, 0)) > 0 ORDER BY SUM(COALESCE(fish_caught, 0)) DESC LIMIT 1`, [guildId, yesterdayStr]);
            const fisherData = fisherDataRes.rows[0];
            const pvpDataRes = await db.query(`SELECT userid FROM kings_board_tracker WHERE guildid = $1 AND date = $2 GROUP BY userid HAVING SUM(COALESCE(pvp_wins, 0)) > 0 ORDER BY SUM(COALESCE(pvp_wins, 0)) DESC LIMIT 1`, [guildId, yesterdayStr]);
            const pvpData = pvpDataRes.rows[0];
            const farmDataRes = await db.query(`SELECT userid FROM kings_board_tracker WHERE guildid = $1 AND date = $2 GROUP BY userid HAVING SUM(COALESCE(crops_harvested, 0)) > 0 ORDER BY SUM(COALESCE(crops_harvested, 0)) DESC LIMIT 1`, [guildId, yesterdayStr]);
            const farmData = farmDataRes.rows[0];

            const winnersRaw = [
                { id: casinoData?.userid, title: 'ملك الكازينو', rep: 5, roleCol: 'rolecasinoking' },
                { id: abyssData?.userid, title: 'ملك الهاوية', rep: 4, roleCol: 'roleabyss' },
                { id: chatterData?.userid, title: 'ملك البلاغة', rep: 7, roleCol: 'rolechatter' },
                { id: philanData?.userid, title: 'ملك الكرم', rep: 1, roleCol: 'rolephilanthropist' },
                { id: advisorData?.userid, title: 'ملك الحكمة', rep: 2, roleCol: 'roleadvisor' },
                { id: fisherData?.userid, title: 'ملك القنص', rep: 2, roleCol: 'rolefisherking' },
                { id: pvpData?.userid, title: 'ملك النزاع', rep: 3, roleCol: 'rolepvpking' },
                { id: farmData?.userid, title: 'ملك الحصاد', rep: 2, roleCol: 'rolefarmking' }
            ].filter(w => w.id && w.id !== 'none');

            if (winnersRaw.length === 0) continue;

            let kingsToAnnounce = [];

            for (const w of winnersRaw) {
                if (settings[w.roleCol]) {
                    const oldRole = guild.roles.cache.get(settings[w.roleCol]);
                    if (oldRole) {
                        for (const member of oldRole.members.values()) {
                            await member.roles.remove(oldRole, "تجريد العرش اليومي").catch(()=>{});
                        }
                    }
                }

                const member = await guild.members.fetch(w.id).catch(()=>null);
                const user = member ? member.user : await client.users.fetch(w.id).catch(()=>null);
                
                if (member && settings[w.roleCol]) {
                    member.roles.add(settings[w.roleCol], `تتويج بلقب ${w.title}`).catch(()=>{});
                }

                if (user) {
                    await db.query("INSERT INTO user_reputation (userid, guildid, rep_points) VALUES ($1, $2, $3) ON CONFLICT(userid, guildid) DO UPDATE SET rep_points = user_reputation.rep_points + $4", [w.id, guildId, w.rep, w.rep]);
                    kingsToAnnounce.push({
                        title: w.title,
                        name: member ? member.displayName : user.username,
                        rep: w.rep
                    });
                }
            }

            const announceChannel = guild.channels.cache.get(settings.guildannouncechannelid);
            if (announceChannel && kingsToAnnounce.length > 0) {
                const perms = announceChannel.permissionsFor(guild.members.me);
                if (perms && perms.has(PermissionsBitField.Flags.SendMessages) && perms.has(PermissionsBitField.Flags.AttachFiles)) {
                    try {
                        if (generateKingsAnnouncementImage) {
                            const buffer = await generateKingsAnnouncementImage(kingsToAnnounce, yesterdayStr);
                            const attachment = new AttachmentBuilder(buffer, { name: 'kings-board.png' });
                            
                            await announceChannel.send({
                                content: `## 👑 || تـتـويـج مـلـوك الإمـبـراطـوريـة || 👑\nانتهى اليوم، وتم تتويج هؤلاء الأبطال بألقاب الملوك لجهودهم العظيمة!`,
                                files: [attachment]
                            }).catch(()=>{});
                        }
                    } catch(e) { console.error("Error generating kings image:", e); }
                }
            }
        }

        await db.query("INSERT INTO kings_daily_payout (datestr) VALUES ($1)", [yesterdayStr]);
    } catch (e) { console.error("Reward Daily Kings Error:", e); }
}

async function updateGuildStat(client, guildId, userId, statName, valueToAdd) {
    try {
        const db = client.sql; // 🔥 تصحيح client.db إلى client.sql
        if (!db) return;
        await ensureKingTrackerTable(db);

        const todayStr = getTodayDateString(); 
        const addedVal = parseInt(valueToAdd) || 0;
        
        if (addedVal === 0 && statName !== 'max_dungeon_floor') return;

        if (statName === 'max_dungeon_floor') {
            // 🔥 تصحيح: استخدام "user" و guild
            const rowRes = await db.query('SELECT max_dungeon_floor FROM levels WHERE "user" = $1 AND guild = $2', [userId, guildId]);
            const row = rowRes.rows[0];
            if (row) {
                if (addedVal > (row.max_dungeon_floor || 0)) {
                    await db.query('UPDATE levels SET max_dungeon_floor = $1 WHERE "user" = $2 AND guild = $3', [addedVal, userId, guildId]);
                }
            } else {
                await db.query('INSERT INTO levels ("user", guild, xp, level, totalxp, mora, max_dungeon_floor) VALUES ($1, $2, 0, 1, 0, 0, $3)', [userId, guildId, addedVal]);
            }
        } else {
            const dailyID = `${userId}-${guildId}-${todayStr}`;
            const colName = statName.toLowerCase();
            
            await db.query(`
                INSERT INTO kings_board_tracker (id, userid, guildid, date, ${colName}) 
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT(id) DO UPDATE SET ${colName} = COALESCE(kings_board_tracker.${colName}, 0) + $6
            `, [dailyID, userId, guildId, todayStr, addedVal, addedVal]);

            try {
                await db.query(`
                    INSERT INTO user_daily_stats (id, userid, guildid, date, ${colName}) 
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT(id) DO UPDATE SET ${colName} = COALESCE(user_daily_stats.${colName}, 0) + $6
                `, [dailyID, userId, guildId, todayStr, addedVal, addedVal]);
            } catch(e){}
        }
    } catch (error) {
        console.error("[Guild Stat Update Error]:", error);
    }
}

module.exports = { handleQuestPanel, handleGuildBoard: handleQuestPanel, autoUpdateKingsBoard, updateGuildStat, rewardDailyKings };
