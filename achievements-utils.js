// achievements-utils.js

const { EmbedBuilder, Colors } = require('discord.js');
const path = require('path');
const questsConfig = require(path.join(process.cwd(), 'json', 'quests-config.json'));

const ROWS_PER_PAGE_ACH = 5;

// =====================================================================
// 1. فحص الإنجازات (المنطق الرئيسي)
// =====================================================================
async function checkAchievements(client, member, levelData, totalStats) {
    const sql = client.sql;
    if (!sql || !sql.open) return;

    // ✅ إنشاء جدول تتبع التكرار (للإنجازات المتكررة مثل البوستات)
    sql.prepare("CREATE TABLE IF NOT EXISTS achievement_tracking (id TEXT PRIMARY KEY, count INTEGER)").run();

    const guildID = member.guild.id;
    const userID = member.id;

    // جلب البيانات الضرورية
    const streakData = sql.prepare("SELECT * FROM streaks WHERE guildID = ? AND userID = ?").get(guildID, userID);
    const mediaStreakData = sql.prepare("SELECT * FROM media_streaks WHERE guildID = ? AND userID = ?").get(guildID, userID);

    // تجهيز القيم الحالية للمقارنة
    const currentStats = {
        level: levelData ? levelData.level : 1,
        mora: levelData ? levelData.mora : 0,
        messages: levelData ? levelData.messages : 0, 
        ...(totalStats || {}),
        streak: streakData ? streakData.streakCount : 0,
        highestStreak: streakData ? streakData.highestStreak : 0,
        highestMediaStreak: mediaStreakData ? mediaStreakData.highestStreak : 0,
        has_caesar_role: member.roles.cache.has(questsConfig.special_roles?.caesar_role) ? 1 : 0,
        has_race_role: 0, 
        has_tree_role: member.roles.cache.has(questsConfig.special_roles?.tree_role) ? 1 : 0,
    };

    // حلقة تكرارية على جميع الإنجازات
    for (const achievement of questsConfig.achievements) {
        
        let targetValue = achievement.goal;
        let currentValue = currentStats[achievement.stat] || 0;

        // 🔥 معالجة خاصة لإنجاز تعزيز السيرفر (Server Boosts) ليكون متكرراً 🔥
        if (achievement.stat === 'total_boosts') {
            const trackingId = `${userID}-${guildID}-${achievement.id}`;
            
            // جلب آخر عدد تم مكافأة اللاعب عليه
            let tracker = sql.prepare("SELECT count FROM achievement_tracking WHERE id = ?").get(trackingId);
            let lastRewardedCount = tracker ? tracker.count : 0;

            if (currentValue > lastRewardedCount) {
                // ✅ منح الجائزة
                await grantAchievementReward(client, member, achievement, sql, true);
                
                // تحديث العداد
                sql.prepare("INSERT OR REPLACE INTO achievement_tracking (id, count) VALUES (?, ?)").run(trackingId, currentValue);
                
                // تسجيل الإنجاز للعرض فقط
                sql.prepare("INSERT OR IGNORE INTO user_achievements (userID, guildID, achievementID, obtainedAt) VALUES (?, ?, ?, ?)").run(userID, guildID, achievement.id, Date.now());
            }
            continue;
        }

        // --- المعالجة العادية لباقي الإنجازات ---
        const hasAch = sql.prepare("SELECT 1 FROM user_achievements WHERE userID = ? AND guildID = ? AND achievementID = ?").get(userID, guildID, achievement.id);
        if (hasAch) continue; 

        if (currentValue >= targetValue) {
            await grantAchievementReward(client, member, achievement, sql, false);
            sql.prepare("INSERT INTO user_achievements (userID, guildID, achievementID, obtainedAt) VALUES (?, ?, ?, ?)").run(userID, guildID, achievement.id, Date.now());
        }
    }
}

// =====================================================================
// 2. دالة منح الجائزة وإرسال الرسالة
// =====================================================================
async function grantAchievementReward(client, member, achievement, sql, isRepeatable = false) {
    let xpReward = achievement.reward_xp || 0;
    let moraReward = achievement.reward_mora || 0;
    let roleReward = achievement.reward_role || null;

    let userData = client.getLevel.get(member.id, member.guild.id);
    if (userData) {
        userData.xp += xpReward;
        userData.totalXP += xpReward;
        userData.mora += moraReward;
        client.setLevel.run(userData);
    }

    if (roleReward) {
        try { await member.roles.add(roleReward); } catch (e) {}
    }

    const settings = sql.prepare("SELECT achievementChannelID FROM settings WHERE guild = ?").get(member.guild.id);
    if (settings && settings.achievementChannelID) {
        const channel = member.guild.channels.cache.get(settings.achievementChannelID);
        if (channel) {
            const EMOJI_XP = '<:xp:1435647161730469958>'; 
            const EMOJI_MORA = '<:mora:1435647151349698621>';

            let desc = `**الإنجـاز:** ${achievement.name}\n` +
                       `**المتطلب:** ${achievement.description}\n` +
                       `────────────────────\n` +
                       `🎁 **الـجـوائـز:**\n`;

            if (xpReward > 0) desc += `• ${xpReward} ${EMOJI_XP}\n`;
            if (moraReward > 0) desc += `• ${moraReward} ${EMOJI_MORA}\n`;
            if (roleReward) desc += `• رتبة: <@&${roleReward}>\n`;

            if (isRepeatable) {
                desc += `\n🔄 **(مكافأة متكررة: تم تعزيز السيرفر مجدداً!)**`;
            }

            const embed = new EmbedBuilder()
                .setTitle(`🏆 إنجـاز جـديـد!`)
                .setAuthor({ name: member.displayName, iconURL: member.user.displayAvatarURL() })
                .setDescription(desc)
                .setColor(Colors.Gold)
                .setThumbnail("https://i.postimg.cc/k49M41bX/trophy.png")
                .setTimestamp();

            await channel.send({ content: `<@${member.id}>`, embeds: [embed] });
        }
    }
}

// =====================================================================
// 3. تجهيز بيانات صفحة الإنجازات (للعرض في الأمر)
// =====================================================================
function getAchievementPageData(sql, member, levelData, totalStats, completedAchievements, page = 1) {
    // ✅✅✅ الإصلاح: التأكد من وجود الجدول هنا أيضاً لمنع الخطأ ✅✅✅
    sql.prepare("CREATE TABLE IF NOT EXISTS achievement_tracking (id TEXT PRIMARY KEY, count INTEGER)").run();

    const achievements = questsConfig.achievements;
    
    const streakData = sql.prepare("SELECT * FROM streaks WHERE guildID = ? AND userID = ?").get(member.guild.id, member.id);
    const mediaStreakData = sql.prepare("SELECT * FROM media_streaks WHERE guildID = ? AND userID = ?").get(member.guild.id, member.id);
    
    // الآن هذا السطر لن يسبب خطأ
    const trackingData = sql.prepare("SELECT id, count FROM achievement_tracking WHERE id LIKE ?").all(`${member.id}-${member.guild.id}-%`);

    const perPage = ROWS_PER_PAGE_ACH;
    const totalPages = Math.ceil(achievements.length / perPage);
    page = Math.max(1, Math.min(page, totalPages));

    const start = (page - 1) * perPage;
    const end = start + perPage;
    const achievementsToShow = achievements.slice(start, end);

    const achievementsData = achievementsToShow.map(ach => {
        const isDone = completedAchievements.some(c => c.achievementID === ach.id);
        let currentProgress = 0;

        if (ach.stat === 'total_boosts') {
            if (totalStats && totalStats.total_boosts) {
                currentProgress = totalStats.total_boosts;
            }
        } 
        else if (isDone) {
            currentProgress = ach.goal;
        } 
        else {
            if (levelData && levelData.hasOwnProperty(ach.stat)) {
                currentProgress = levelData[ach.stat];
            } else if (totalStats && totalStats.hasOwnProperty(ach.stat)) {
                currentProgress = totalStats[ach.stat];
            } else if (ach.stat === 'highestStreak' && streakData) {
                currentProgress = streakData.highestStreak || 0;
            } else if (ach.stat === 'highestMediaStreak' && mediaStreakData) {
                currentProgress = mediaStreakData.highestStreak || 0;
            } else if (streakData && streakData.hasOwnProperty(ach.stat)) {
                currentProgress = streakData[ach.stat];
            } else if (ach.stat === 'has_caesar_role' || ach.stat === 'has_race_role' || ach.stat === 'has_tree_role') {
                currentProgress = 0; 
            }
        }

        const displayProgress = ach.stat === 'total_boosts' ? currentProgress : Math.min(currentProgress || 0, ach.goal);

        return {
            achievement: ach,
            progress: displayProgress,
            isDone: isDone
        };
    });

    return { achievementsData, totalPages };
}

module.exports = {
    checkAchievements,
    getAchievementPageData
};
