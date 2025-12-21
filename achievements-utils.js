const questsConfig = require('../json/quests-config.json'); // تأكد من المسار الصحيح
const ROWS_PER_PAGE_ACH = 5;

function getAchievementPageData(sql, member, levelData, totalStats, completedAchievements, page = 1) {
    const achievements = questsConfig.achievements;
    const streakData = sql.prepare("SELECT * FROM streaks WHERE guildID = ? AND userID = ?").get(member.guild.id, member.id);
    const mediaStreakData = sql.prepare("SELECT * FROM media_streaks WHERE guildID = ? AND userID = ?").get(member.guild.id, member.id);

    // إضافة: جلب إحصائيات التاق إذا كانت مخزنة كـ quest stat
    // أو الاعتماد على completedAchievements
    
    const perPage = ROWS_PER_PAGE_ACH;
    const totalPages = Math.ceil(achievements.length / perPage);
    page = Math.max(1, Math.min(page, totalPages));

    const start = (page - 1) * perPage;
    const end = start + perPage;
    const achievementsToShow = achievements.slice(start, end);

    const achievementsData = achievementsToShow.map(ach => {
        const isDone = completedAchievements.some(c => c.achievementID === ach.id);

        let currentProgress = 0;

        // 1. إذا كان الإنجاز مكتملاً، فالتقدم هو الهدف
        if (isDone) {
            currentProgress = ach.goal;
        } 
        // 2. التحقق من أنواع الإنجازات المختلفة
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
            }
            
            // 🔥🔥 التعديل الجديد: دعم server_tag والمهام الخاصة 🔥🔥
            else if (ach.stat === 'server_tag' || ach.stat === 'has_caesar_role' || ach.stat === 'has_race_role' || ach.stat === 'has_tree_role') {
                // هذه المهام منطقية (نعم/لا)، إذا لم تكن مكتملة (isDone=false)، فالتقدم 0
                currentProgress = 0; 
                
                // تحسين إضافي: التحقق اللحظي للتاق للعرض فقط (اختياري)
                if (ach.stat === 'server_tag') {
                    // محاولة جلب التاق من الإعدادات للتحقق الشكلي
                    try {
                        const settings = sql.prepare("SELECT serverTag FROM settings WHERE guild = ?").get(member.guild.id);
                        if (settings && settings.serverTag && member.displayName.includes(settings.serverTag)) {
                            currentProgress = 1; // يظهر كـ 1/1 حتى لو لم يسجل في القاعدة بعد
                        }
                    } catch (e) {}
                }
            }
        }

        return {
            achievement: ach,
            progress: Math.min(currentProgress || 0, ach.goal), // ضمان عدم تجاوز الهدف وعدم وجود null
            isDone: isDone
        };
    });

    return { achievementsData, totalPages };
}

module.exports = {
    getAchievementPageData
};
