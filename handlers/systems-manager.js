const { EmbedBuilder, PermissionsBitField, AttachmentBuilder } = require("discord.js");
const questsConfig = require('../json/quests-config.json');
const announcementsTexts = require('../json/announcements-texts.js');
const { generateLevelUpCard } = require('../generators/levelup-card-generator');

function getTodayDateString() { return new Date().toISOString().split('T')[0]; }
function getWeekStartDateString() {
    const now = new Date();
    const diff = now.getUTCDate() - (now.getUTCDay() + 2) % 7; 
    const friday = new Date(now.setUTCDate(diff));
    friday.setUTCHours(0, 0, 0, 0); 
    return friday.toISOString().split('T')[0];
}

module.exports = (client, db) => {
    const defaultDailyStats = { messages: 0, images: 0, stickers: 0, emojis_sent: 0, reactions_added: 0, replies_sent: 0, mentions_received: 0, vc_minutes: 0, water_tree: 0, counting_channel: 0, meow_count: 0, streaming_minutes: 0, disboard_bumps: 0, boost_channel_reactions: 0, topgg_votes: 0 };
    const defaultTotalStats = { total_messages: 0, total_images: 0, total_stickers: 0, total_emojis_sent: 0, total_reactions_added: 0, total_replies_sent: 0, total_mentions_received: 0, total_vc_minutes: 0, total_disboard_bumps: 0, total_topgg_votes: 0 };

    client.checkAndAwardLevelRoles = async function(member, newLevel) {
        try {
            const guild = member.guild;
            const botMember = guild.members.me;

            if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) return;

            const allLevelRolesConfigRes = await db.query(`SELECT "level", "roleID" FROM level_roles WHERE "guildID" = $1 ORDER BY "level" DESC`, [guild.id]);
            const allLevelRolesConfig = allLevelRolesConfigRes.rows;
            if (allLevelRolesConfig.length === 0) return;

            member = await member.fetch().catch(() => null);
            if (!member) return;

            let targetRoleID = null;
            for (const row of allLevelRolesConfig) {
                if (newLevel >= row.level) {
                    targetRoleID = row.roleID;
                    break; 
                }
            }

            let roleToAdd = null;
            const rolesToRemove = [];

            for (const row of allLevelRolesConfig) {
                const rowRoleID = row.roleID;
                const role = guild.roles.cache.get(rowRoleID);
                if (!role) continue;
                if (role.position >= botMember.roles.highest.position) continue; 

                if (targetRoleID && rowRoleID === targetRoleID) {
                    if (!member.roles.cache.has(role.id)) roleToAdd = role;
                } else {
                    if (member.roles.cache.has(role.id)) rolesToRemove.push(role);
                }
            }

            if (rolesToRemove.length > 0) await member.roles.remove(rolesToRemove).catch(()=>{});
            if (roleToAdd) await member.roles.add(roleToAdd).catch(()=>{});

        } catch (err) {}
    }

    client.sendLevelUpMessage = async function(messageOrInteraction, member, newLevel, oldLevel, xpData) {
        try {
            await client.checkAndAwardLevelRoles(member, newLevel);
            const guild = member.guild;
            
            const customSettingsRes = await db.query(`SELECT * FROM settings WHERE "guild" = $1`, [guild.id]);
            let customSettings = customSettingsRes.rows[0] || {};
            
            let channelToSend = null;
              
            try {
                let channelDataRes = await db.query(`SELECT "channel" FROM channel WHERE "guild" = $1`, [guild.id]);
                let channelData = channelDataRes.rows[0];
                if (channelData && channelData.channel && channelData.channel !== 'Default') {
                    const fetchedChannel = guild.channels.cache.get(channelData.channel);
                    if (fetchedChannel) channelToSend = fetchedChannel;
                }
            } catch(e) {}

            const c1 = customSettings.casinoChannelID;
            const c2 = customSettings.casinoChannelID2;

            if (!channelToSend) {
                if (messageOrInteraction && messageOrInteraction.channel) {
                    if (c2 && c1 && messageOrInteraction.channel.id === c2) {
                          const mainCasino = guild.channels.cache.get(c1);
                          if (mainCasino) channelToSend = mainCasino;
                          else channelToSend = messageOrInteraction.channel;
                    } else {
                        channelToSend = messageOrInteraction.channel;
                    }
                } else return;
            }
              
            let levelUpContent = null;
            let embed;
            const id = `${member.id}-${guild.id}`; 
            let notifSettings = await client.getQuestNotif(id);
            const lNotif = notifSettings ? notifSettings.levelNotif : 1;
            if (lNotif === 0) return; 

            const lvlUpTitle = customSettings.lvlUpTitle;
            const lvlUpDesc = customSettings.lvlUpDesc;
            const lvlUpColor = customSettings.lvlUpColor;
            const lvlUpImage = customSettings.lvlUpImage;
            const lvlUpMention = customSettings.lvlUpMention;

            if (lvlUpTitle) {
                function antonymsLevelUp(string) { return string.replace(/{member}/gi, `${member}`).replace(/{level}/gi, `${newLevel}`).replace(/{level_old}/gi, `${oldLevel}`).replace(/{xp}/gi, `${xpData.xp}`).replace(/{totalXP}/gi, `${xpData.totalXP}`); }
                embed = new EmbedBuilder().setTitle(antonymsLevelUp(lvlUpTitle)).setDescription(antonymsLevelUp(lvlUpDesc.replace(/\\n/g, '\n'))).setColor(lvlUpColor || "Random").setTimestamp();
                if (lvlUpImage) embed.setImage(antonymsLevelUp(lvlUpImage)); 
                if (Number(lvlUpMention) === 1) levelUpContent = `${member}`; 
            } else {
                embed = new EmbedBuilder().setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL({ dynamic: true }) }).setColor("Random").setDescription(`**Congratulations** ${member}! You have now leveled up to **level ${newLevel}**`);
            }
            
            const perms = channelToSend.permissionsFor(guild.members.me);
            if (perms.has(PermissionsBitField.Flags.SendMessages) && perms.has(PermissionsBitField.Flags.ViewChannel)) {
                await channelToSend.send({ content: levelUpContent, embeds: [embed] }).catch(() => {});
            }
        } catch (err) {}
    }

    client.sendQuestAnnouncement = async function(guild, member, quest, questType = 'achievement') { 
        try { 
            const id = `${member.id}-${guild.id}`; 
            let notifSettings = await client.getQuestNotif(id); 
            if (!notifSettings) { 
                notifSettings = { id: id, userID: member.id, guildID: guild.id, dailyNotif: 1, weeklyNotif: 1, achievementsNotif: 1, levelNotif: 1, kingsNotif: 1, badgesNotif: 1 }; 
                await client.setQuestNotif(notifSettings); 
            } 
            
            const dNotif = notifSettings.dailyNotif;
            const wNotif = notifSettings.weeklyNotif;
            const aNotif = notifSettings.achievementsNotif;

            let sendMention = false; 
            if (questType === 'daily') {
                if (dNotif === 0) return; 
                sendMention = true; 
            }
            if (questType === 'weekly') {
                if (wNotif === 0) return; 
                sendMention = true; 
            }
            if (questType === 'achievement') {
                if (aNotif === 0) return; 
                sendMention = true; 
            }
            
            const userIdentifier = sendMention ? `${member}` : `**${member.displayName}**`; 
            
            const settingsRes = await db.query(`SELECT "questChannelID", "lastQuestPanelChannelID" FROM settings WHERE "guild" = $1`, [guild.id]); 
            const settings = settingsRes.rows[0]; 
            const qChannel = settings ? settings.questChannelID : null;
            if (!qChannel) return; 
            const channel = guild.channels.cache.get(qChannel); 
            if (!channel) return; 
            const perms = channel.permissionsFor(guild.members.me); 
            if (!perms || !perms.has(PermissionsBitField.Flags.SendMessages)) return; 
            
            const canAttachFiles = perms.has(PermissionsBitField.Flags.AttachFiles); 
            const questName = quest.name; 
            const reward = quest.reward; 
            let message = ''; 
            let files = []; 
            const rewardDetails = `\n- **حصـلـت عـلـى:**\nMora: \`${reward.mora.toLocaleString()}\` <:mora:1435647151349698621> | XP: \`${reward.xp.toLocaleString()}\` <a:levelup:1437805366048985290>`; 
            
            const pChannel = settings ? settings.lastQuestPanelChannelID : null;
            const panelChannelLink = pChannel ? `\n\n✶ قـاعـة الانجـازات والمـهام والاشعـارات:\n<#${pChannel}>` : ""; 
            
            if (canAttachFiles) { 
                try { 
                    let attachment; 
                    if (questType === 'achievement') { 
                        const userAvatar = member.user.displayAvatarURL({ extension: 'png', size: 256 });
                        const userName = member.displayName || member.user.username;
                        const buffer = await client.generateAchievementCard(userAvatar, userName, quest.name, quest.description, quest.reward.mora, quest.reward.xp, quest.repReward || 0);
                        attachment = new AttachmentBuilder(buffer, { name: 'achievement.png' });
                    } else { 
                        const typeForAlert = questType === 'weekly' ? 'rare' : 'daily'; 
                        attachment = await client.generateQuestAlert(member, quest, typeForAlert); 
                    } 
                    if(attachment) files.push(attachment); 
                } catch (imgErr) {} 
            } 
            
            message = announcementsTexts.getQuestMessage(questType, userIdentifier, questName, rewardDetails, panelChannelLink, client);
            await channel.send({ content: message, files: files, allowedMentions: { users: sendMention ? [member.id] : [] } }).catch(()=>{}); 
        } catch (err) {} 
    }

    client.checkQuests = async function(client, member, stats, questType, dateKey) {
        const questsToCheck = questsConfig[questType] || [];
        let newlyCompleted = 0;

        for (const quest of questsToCheck) {
            const currentProgress = stats[quest.stat] || 0;
            if (currentProgress >= quest.goal) {
                const claimID = `${member.id}-${member.guild.id}-${quest.id}-${dateKey}`;
                const existingClaimRes = await db.query(`SELECT * FROM user_quest_claims WHERE "claimID" = $1`, [claimID]);
                const existingClaim = existingClaimRes.rows[0];
                if (!existingClaim) {
                    await db.query(`INSERT INTO user_quest_claims ("claimID", "userID", "guildID", "questID", "dateStr") VALUES ($1, $2, $3, $4, $5) ON CONFLICT ("claimID") DO NOTHING`, [claimID, member.id, member.guild.id, quest.id, dateKey]);
                    let levelData = await client.getLevel(member.id, member.guild.id);
                    if (!levelData) levelData = { ...client.defaultData, user: member.id, guild: member.guild.id };
                    levelData.mora = (Number(levelData.mora) || 0) + quest.reward.mora;
                    levelData.xp = (Number(levelData.xp) || 0) + quest.reward.xp;
                    levelData.totalXP = (Number(levelData.totalXP) || 0) + quest.reward.xp;
                    const nextXP = 5 * (levelData.level ** 2) + (50 * levelData.level) + 100;
                    if (levelData.xp >= nextXP) {
                        levelData.xp -= nextXP;
                        levelData.level += 1;
                    }
                    await client.setLevel(levelData);
                    await client.sendQuestAnnouncement(member.guild, member, quest, questType);
                    newlyCompleted++;
                }
            }
        }

        if (newlyCompleted > 0 && questsToCheck.length > 0) {
            const countDataRes = await db.query(`SELECT COUNT(*) as cnt FROM user_quest_claims WHERE "userID" = $1 AND "guildID" = $2 AND "dateStr" = $3`, [member.id, member.guild.id, dateKey]);
            const countData = countDataRes.rows[0];
            const completedCount = countData ? Number(countData.cnt) : 0;
            const threshold = Math.max(1, questsToCheck.length - 1); 

            if (completedCount >= threshold) {
                const settingsRes = await db.query(`SELECT "questChannelID", "roleDailyBadge", "roleWeeklyBadge", "lastQuestPanelChannelID" FROM settings WHERE "guild" = $1`, [member.guild.id]);
                const settings = settingsRes.rows[0];
                const qChannel = settings ? settings.questChannelID : null;
                const announceChannel = qChannel ? member.guild.channels.cache.get(qChannel) : null;
                
                const notifSettingsRes = await db.query(`SELECT "badgesNotif" FROM quest_notifications WHERE "id" = $1`, [`${member.id}-${member.guild.id}`]);
                const notifSettings = notifSettingsRes.rows[0];
                const bNotif = notifSettings ? notifSettings.badgesNotif : 1;
                
                const pChannel = settings ? settings.lastQuestPanelChannelID : null;
                const panelChannelLink = pChannel ? `\n\n✶ قـاعـة الانجـازات والمـهام والاشعـارات:\n<#${pChannel}>` : "";

                if (questType === 'daily') {
                    try { await db.query(`ALTER TABLE user_daily_stats ADD COLUMN IF NOT EXISTS "daily_badge_given" BIGINT DEFAULT 0`); } catch(e){}
                    const dailyId = `${member.id}-${member.guild.id}-${dateKey}`;
                    const dailyDataRes = await db.query(`SELECT "daily_badge_given" FROM user_daily_stats WHERE "id" = $1`, [dailyId]);
                    const dailyData = dailyDataRes.rows[0];
                    const dBadgeGiven = dailyData ? Number(dailyData.daily_badge_given) : 0;

                    if (dBadgeGiven === 0) {
                        await db.query(`UPDATE user_daily_stats SET "daily_badge_given" = 1 WHERE "id" = $1`, [dailyId]);
                        const rDailyBadge = settings ? settings.roleDailyBadge : null;
                        if (rDailyBadge) member.roles.add(rDailyBadge).catch(()=>{});

                        if (announceChannel && bNotif === 1) {
                            let files = [];
                            if (announceChannel.permissionsFor(member.guild.members.me)?.has(PermissionsBitField.Flags.AttachFiles)) {
                                try {
                                    const { generateEpicAnnouncement } = require('../generators/announcement-generator.js'); 
                                    const buffer = await generateEpicAnnouncement(member.user, '✨ انـجـاز يـومـي ✨', 'ختم المهام اليومية', 'لم يترك مهمة إلا وأنجزها بكل شجاعة!', 'اكتملت جميع المهام', '#00BFFF');
                                    files.push(new AttachmentBuilder(buffer, { name: `daily-badge-${Date.now()}.png` }));
                                } catch(e) {}
                            }
                            const badgeMsg = announcementsTexts.getBadgeMessage('daily', `<@${member.id}>`, client, panelChannelLink);
                            await announceChannel.send({ content: badgeMsg, files: files }).catch(()=>{});
                        }
                    }
                } 
                else if (questType === 'weekly') {
                    try { await db.query(`ALTER TABLE user_weekly_stats ADD COLUMN IF NOT EXISTS "weekly_badge_given" BIGINT DEFAULT 0`); } catch(e){}
                    const weeklyId = `${member.id}-${member.guild.id}-${dateKey}`;
                    const weeklyDataRes = await db.query(`SELECT "weekly_badge_given" FROM user_weekly_stats WHERE "id" = $1`, [weeklyId]);
                    const weeklyData = weeklyDataRes.rows[0];
                    const wBadgeGiven = weeklyData ? Number(weeklyData.weekly_badge_given) : 0;

                    if (wBadgeGiven === 0) {
                        await db.query(`UPDATE user_weekly_stats SET "weekly_badge_given" = 1 WHERE "id" = $1`, [weeklyId]);
                        const rWeeklyBadge = settings ? settings.roleWeeklyBadge : null;
                        if (rWeeklyBadge) member.roles.add(rWeeklyBadge).catch(()=>{});

                        if (announceChannel && bNotif === 1) {
                            let files = [];
                            if (announceChannel.permissionsFor(member.guild.members.me)?.has(PermissionsBitField.Flags.AttachFiles)) {
                                try {
                                    const { generateEpicAnnouncement } = require('../generators/announcement-generator.js'); 
                                    const buffer = await generateEpicAnnouncement(member.user, '🌟 انـجـاز أسـبـوعـي 🌟', 'أسطورة المهام الأسبوعية', 'تحدى المستحيل وختم الأسبوع بأكمله!', 'اكتملت جميع المهام', '#FF8C00');
                                    files.push(new AttachmentBuilder(buffer, { name: `weekly-badge-${Date.now()}.png` }));
                                } catch(e) {}
                            }
                            const badgeMsg = announcementsTexts.getBadgeMessage('weekly', `<@${member.id}>`, client, panelChannelLink);
                            await announceChannel.send({ content: badgeMsg, files: files }).catch(()=>{});
                        }
                    }
                }
            }
        }
    }

    client.checkAchievements = async function(client, member, levelData, totalStatsData) {
        for (const ach of questsConfig.achievements) {
            let currentProgress = 0;
            const streakDataRes = await db.query(`SELECT * FROM streaks WHERE "guildID" = $1 AND "userID" = $2`, [member.guild.id, member.id]);
            const streakData = streakDataRes.rows[0];
            
            const mediaStreakDataRes = await db.query(`SELECT * FROM media_streaks WHERE "guildID" = $1 AND "userID" = $2`, [member.guild.id, member.id]);
            const mediaStreakData = mediaStreakDataRes.rows[0];
              
            if (!totalStatsData) totalStatsData = await client.getTotalStats(`${member.id}-${member.guild.id}`) || {};
            totalStatsData = client.safeMerge(totalStatsData, defaultTotalStats); 

            if (ach.stat === 'messages' || ach.stat === 'total_messages') currentProgress = totalStatsData.total_messages || 0;
            else if (ach.stat === 'images') currentProgress = totalStatsData.total_images || 0;
            else if (ach.stat === 'stickers') currentProgress = totalStatsData.total_stickers || 0;
            else if (ach.stat === 'emojis_sent') currentProgress = totalStatsData.total_emojis_sent || 0; 
            else if (ach.stat === 'reactions_added' || ach.stat === 'total_reactions_added') currentProgress = totalStatsData.total_reactions_added || 0;
            else if (ach.stat === 'replies_sent') currentProgress = totalStatsData.total_replies_sent || 0;
            else if (ach.stat === 'vc_minutes' || ach.stat === 'totalVCTime') currentProgress = totalStatsData.total_vc_minutes || 0;
            else if (ach.stat === 'disboard_bumps') currentProgress = totalStatsData.total_disboard_bumps || 0;
            else if (ach.stat === 'topgg_votes') currentProgress = totalStatsData.total_topgg_votes || 0;
            else if (ach.stat === 'meow_count' || ach.stat === 'total_meow_count') {
                 let ld = levelData || await client.getLevel(member.id, member.guild.id);
                 currentProgress = ld ? (Number(ld.total_meow_count) || 0) : 0;
            }
            else if (ach.stat === 'boost_count') {
                 let ld = levelData || await client.getLevel(member.id, member.guild.id);
                 currentProgress = ld ? (Number(ld.boost_count) || 0) : 0;
            }
            else if (levelData && levelData.hasOwnProperty(ach.stat)) currentProgress = levelData[ach.stat];
            else if (totalStatsData.hasOwnProperty(ach.stat)) currentProgress = totalStatsData[ach.stat];
            else if (ach.stat === 'highestStreak' && streakData) currentProgress = Number(streakData.highestStreak) || 0;
            else if (ach.stat === 'highestMediaStreak' && mediaStreakData) currentProgress = Number(mediaStreakData.highestStreak) || 0;
            else if (streakData && streakData.hasOwnProperty(ach.stat)) currentProgress = streakData[ach.stat];
            else {
                 if (['has_caesar_role', 'has_race_role', 'has_tree_role', 'has_tag_role'].includes(ach.stat)) continue;
                continue;
            }

            if (currentProgress >= ach.goal) {
                const existingAchRes = await db.query(`SELECT * FROM user_achievements WHERE "userID" = $1 AND "guildID" = $2 AND "achievementID" = $3`, [member.id, member.guild.id, ach.id]);
                const existingAch = existingAchRes.rows[0];
                if (!existingAch) {
                    await db.query(`INSERT INTO user_achievements ("userID", "guildID", "achievementID", "timestamp") VALUES ($1, $2, $3, $4) ON CONFLICT ("userID", "guildID", "achievementID") DO NOTHING`, [member.id, member.guild.id, ach.id, Date.now()]);
                    let ld = levelData || await client.getLevel(member.id, member.guild.id);
                    if (!ld) ld = { ...client.defaultData, user: member.id, guild: member.guild.id };
                    ld.mora = (Number(ld.mora) || 0) + ach.reward.mora;
                    ld.xp = (Number(ld.xp) || 0) + ach.reward.xp;
                    ld.totalXP = (Number(ld.totalXP) || 0) + ach.reward.xp;
                    await client.setLevel(ld);
                    await client.sendQuestAnnouncement(member.guild, member, ach, 'achievement');
                }
            }
        }
    }

    const RECENT_MESSAGE_WINDOW = 2 * 60 * 60 * 1000;
    client.incrementQuestStats = async function(userID, guildID, stat, amount = 1) {
        if (stat === 'messages') {
            if (!client.recentMessageTimestamps.has(guildID)) client.recentMessageTimestamps.set(guildID, []);
            const guildTimestamps = client.recentMessageTimestamps.get(guildID);
            const now = Date.now();
            for (let i = 0; i < amount; i++) { guildTimestamps.push(now); }
            while (guildTimestamps.length > 0 && guildTimestamps[0] < (now - RECENT_MESSAGE_WINDOW)) { guildTimestamps.shift(); }
        }
        try {
            const dateStr = getTodayDateString();
            const weekStartDateStr = getWeekStartDateString();
            const dailyStatsId = `${userID}-${guildID}-${dateStr}`;
            const weeklyStatsId = `${userID}-${guildID}-${weekStartDateStr}`;
            const totalStatsId = `${userID}-${guildID}`;

            let dailyStats = await client.getDailyStats(dailyStatsId) || { id: dailyStatsId, userID, guildID, date: dateStr };
            let weeklyStats = await client.getWeeklyStats(weeklyStatsId) || { id: weeklyStatsId, userID, guildID, weekStartDate: weekStartDateStr };
            let totalStats = await client.getTotalStats(totalStatsId) || { id: totalStatsId, userID, guildID };

            dailyStats = client.safeMerge(dailyStats, defaultDailyStats);
            weeklyStats = client.safeMerge(weeklyStats, defaultDailyStats);
            totalStats = client.safeMerge(totalStats, defaultTotalStats);

            if (dailyStats.hasOwnProperty(stat)) dailyStats[stat] = (Number(dailyStats[stat]) || 0) + amount;
            if (weeklyStats.hasOwnProperty(stat)) weeklyStats[stat] = (Number(weeklyStats[stat]) || 0) + amount;
              
            if (stat === 'disboard_bumps') totalStats.total_disboard_bumps = (Number(totalStats.total_disboard_bumps) || 0) + amount;
            if (stat === 'messages') totalStats.total_messages = (Number(totalStats.total_messages) || 0) + amount;
            if (stat === 'images') totalStats.total_images = (Number(totalStats.total_images) || 0) + amount;
            if (stat === 'stickers') totalStats.total_stickers = (Number(totalStats.total_stickers) || 0) + amount;
            if (stat === 'emojis_sent') totalStats.total_emojis_sent = (Number(totalStats.total_emojis_sent) || 0) + amount;

            if (stat === 'replies_sent') totalStats.total_replies_sent = (Number(totalStats.total_replies_sent) || 0) + amount;
            if (stat === 'mentions_received') totalStats.total_mentions_received = (Number(totalStats.total_mentions_received) || 0) + amount;
            if (stat === 'vc_minutes') totalStats.total_vc_minutes = (Number(totalStats.total_vc_minutes) || 0) + amount;
            if (stat === 'topgg_votes') totalStats.total_topgg_votes = (Number(totalStats.total_topgg_votes) || 0) + amount;
                      
            await client.setDailyStats(dailyStats);
            await client.setWeeklyStats(weeklyStats);
            
            await client.setTotalStats({
                id: totalStatsId, userID, guildID,
                total_messages: totalStats.total_messages, total_images: totalStats.total_images, total_stickers: totalStats.total_stickers,
                total_emojis_sent: totalStats.total_emojis_sent,
                total_reactions_added: totalStats.total_reactions_added, total_replies_sent: totalStats.total_replies_sent, total_mentions_received: totalStats.total_mentions_received,
                total_vc_minutes: totalStats.total_vc_minutes, total_disboard_bumps: totalStats.total_disboard_bumps,
                total_topgg_votes: totalStats.total_topgg_votes
            });

            const member = client.guilds.cache.get(guildID)?.members.cache.get(userID);
            if (member) {
                await client.checkQuests(client, member, dailyStats, 'daily', dateStr);
                await client.checkQuests(client, member, weeklyStats, 'weekly', weekStartDateStr);
                await client.checkAchievements(client, member, null, totalStats);
                
                 if (stat === 'meow_count' || stat === 'water_tree') {
                     let levelData = await client.getLevel(userID, guildID);
                     if (levelData) await client.checkAchievements(client, member, levelData, totalStats);
                }
            }
        } catch (err) {}
    }

    client.checkRoleAchievement = async function(member, roleId, achievementId) {
        try {
            const guildID = member.guild.id;
            const userID = member.id;
            
            const existingAchRes = await db.query(`SELECT * FROM user_achievements WHERE "userID" = $1 AND "guildID" = $2 AND "achievementID" = $3`, [userID, guildID, achievementId]);
            const existingAch = existingAchRes.rows[0];
            
            const ach = questsConfig.achievements.find(a => a.id === achievementId);
            if (!ach) return;
            
            let hasRole = false;
            if (achievementId === 'ach_race_role') {
                const raceRolesRes = await db.query(`SELECT "roleID" FROM race_roles WHERE "guildID" = $1`, [guildID]);
                const raceRoles = raceRolesRes.rows;
                const raceRoleIDs = raceRoles.map(r => r.roleID);
                hasRole = member.roles.cache.some(role => raceRoleIDs.includes(role.id));
            } else { hasRole = member.roles.cache.has(roleId); }
            
            if (hasRole) {
                if (existingAch) return; 
                await db.query(`INSERT INTO user_achievements ("userID", "guildID", "achievementID", "timestamp") VALUES ($1, $2, $3, $4) ON CONFLICT ("userID", "guildID", "achievementID") DO NOTHING`, [userID, guildID, ach.id, Date.now()]);
                let ld = await client.getLevel(userID, guildID);
                if (!ld) ld = { ...client.defaultData, user: userID, guild: guildID };
                ld.mora = (Number(ld.mora) || 0) + ach.reward.mora;
                ld.xp = (Number(ld.xp) || 0) + ach.reward.xp;
                ld.totalXP = (Number(ld.totalXP) || 0) + ach.reward.xp;
                await client.setLevel(ld);
                await client.sendQuestAnnouncement(member.guild, member, ach, 'achievement');
            } 
        } catch (err) {}
    }
};
