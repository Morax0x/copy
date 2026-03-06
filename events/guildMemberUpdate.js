const { Events, EmbedBuilder } = require("discord.js");
const { updateNickname } = require("../streak-handler.js"); 
const questsConfig = require('../json/quests-config.json');

const recentBoosters = new Set();
const recentNicknameUpdates = new Set();

module.exports = {
    name: Events.GuildMemberUpdate,
    async execute(oldMember, newMember) {
        const client = newMember.client;
        const db = client.sql;
        if (!db) return;

        const guildID = newMember.guild.id;
        const userID = newMember.id;

        try {
            if (oldMember.nickname !== newMember.nickname) {
                if (recentNicknameUpdates.has(userID)) return;

                const streakRes = await db.query("SELECT * FROM streaks WHERE guildID = $1 AND userID = $2", [guildID, userID]);
                const streakData = streakRes.rows[0];

                if (streakData && (streakData.nicknameactive === 1 || streakData.nicknameActive === 1)) {
                    recentNicknameUpdates.add(userID);
                    await updateNickname(newMember, db);
                    setTimeout(() => recentNicknameUpdates.delete(userID), 5000); 
                }
            }

            if (client.checkRoleAchievement) {
                await client.checkRoleAchievement(newMember, null, 'ach_race_role');
                
                const caesarRes = await db.query("SELECT roleID FROM quest_achievement_roles WHERE guildID = $1 AND achievementID = $2", [guildID, 'ach_caesar_role']);
                if (caesarRes.rows.length > 0) await client.checkRoleAchievement(newMember, caesarRes.rows[0].roleid || caesarRes.rows[0].roleID, 'ach_caesar_role');
                
                const treeRes = await db.query("SELECT roleID FROM quest_achievement_roles WHERE guildID = $1 AND achievementID = $2", [guildID, 'ach_tree_role']);
                if (treeRes.rows.length > 0) await client.checkRoleAchievement(newMember, treeRes.rows[0].roleid || treeRes.rows[0].roleID, 'ach_tree_role');
                
                const tagRes = await db.query("SELECT roleID FROM quest_achievement_roles WHERE guildID = $1 AND achievementID = $2", [guildID, 'ach_tag_role']);
                if (tagRes.rows.length > 0) await client.checkRoleAchievement(newMember, tagRes.rows[0].roleid || tagRes.rows[0].roleID, 'ach_tag_role');
            }

            const wasBoosting = oldMember.premiumSince;
            const isBoosting = newMember.premiumSince;

            if (!wasBoosting && isBoosting) {
                if (recentBoosters.has(userID)) return;
                
                recentBoosters.add(userID);
                setTimeout(() => recentBoosters.delete(userID), 60000); 

                const boostQuest = questsConfig.achievements.find(q => q.stat === 'boost_count');

                if (boostQuest) {
                    const lvlRes = await db.query('SELECT * FROM levels WHERE "user" = $1 AND guild = $2', [userID, guildID]);
                    let levelData = lvlRes.rows[0] || { user: userID, guild: guildID, xp: 0, level: 1, mora: 0, bank: 0, totalXP: 0, boost_count: 0 };

                    levelData.boost_count = (levelData.boost_count || 0) + 1;
                    levelData.mora = (levelData.mora || 0) + boostQuest.reward.mora;
                    levelData.xp = (levelData.xp || 0) + boostQuest.reward.xp;
                    levelData.totalxp = (levelData.totalxp || levelData.totalXP || 0) + boostQuest.reward.xp;

                    const nextXP = 5 * (levelData.level ** 2) + (50 * levelData.level) + 100;
                    let leveledUp = false;
                    let oldLevel = levelData.level;

                    if (levelData.xp >= nextXP) {
                        levelData.xp -= nextXP;
                        levelData.level += 1;
                        leveledUp = true;
                    }

                    await db.query(`
                        INSERT INTO levels ("user", guild, mora, xp, totalXP, level, boost_count) 
                        VALUES ($1, $2, $3, $4, $5, $6, $7) 
                        ON CONFLICT ("user", guild) DO UPDATE SET 
                        mora = EXCLUDED.mora, 
                        xp = EXCLUDED.xp, 
                        totalXP = EXCLUDED.totalXP, 
                        level = EXCLUDED.level,
                        boost_count = EXCLUDED.boost_count
                    `, [userID, guildID, levelData.mora, levelData.xp, levelData.totalxp, levelData.level, levelData.boost_count]);

                    if (leveledUp && client.sendLevelUpMessage) {
                        await client.sendLevelUpMessage(newMember, newMember, levelData.level, oldLevel, levelData);
                    }

                    if (client.sendQuestAnnouncement) {
                        await client.sendQuestAnnouncement(newMember.guild, newMember, boostQuest, 'achievement');
                    }
                    
                    const settingsRes = await db.query("SELECT chatChannelID FROM settings WHERE guild = $1", [guildID]);
                    const settings = settingsRes.rows[0];
                    if (settings && (settings.chatchannelid || settings.chatChannelID)) {
                        const channelId = settings.chatchannelid || settings.chatChannelID;
                        const channel = newMember.guild.channels.cache.get(channelId);
                        if (channel) {
                            const embed = new EmbedBuilder()
                                .setTitle('🚀 بوستر جديد!')
                                .setDescription(`شـكـراً لـك ${newMember} عـلـى دعـم الـسـيـرفـر بـالـبـوسـت! ❤️\n\n**الـجـائـزة:**\n💰 ${boostQuest.reward.mora.toLocaleString()} مورا\n✨ ${boostQuest.reward.xp.toLocaleString()} XP`)
                                .setColor('#ff73fa')
                                .setImage('https://i.imgur.com/s160gP1.gif');
                            await channel.send({ content: `${newMember}`, embeds: [embed] });
                        }
                    }
                }
            }

        } catch (err) {
            console.error("[GuildMemberUpdate Error]", err);
        }
    }
};
