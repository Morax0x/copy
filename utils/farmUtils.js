const farmAnimals = require('../json/farm-animals.json');

/**
 * 🐔 دالة لحساب سعة "الحظيرة" (الحيوانات) القصوى.
 */
function getPlayerCapacity(client, userId, guildId) {
    const userData = client.getLevel.get(userId, guildId) || {};
    const userLevel = userData.level || 0;
    
    if (userLevel <= 5) return 30;
    if (userLevel <= 10) return 80;
    if (userLevel <= 20) return 150;
    if (userLevel <= 30) return 250;
    if (userLevel <= 40) return 350;
    if (userLevel <= 50) return 500;
    if (userLevel <= 60) return 600;
    if (userLevel <= 70) return 700;
    if (userLevel <= 80) return 800;
    return 1000;
}

/**
 * 🐔 دالة لحساب المساحة المستخدمة حالياً في الحظيرة.
 */
function getUsedCapacity(sql, userId, guildId) {
    const userFarmRows = sql.prepare("SELECT animalID, quantity FROM user_farm WHERE userID = ? AND guildID = ?").all(userId, guildId);
    let totalSize = 0;
    
    for (const row of userFarmRows) {
        const animalIdStr = String(row.animalID);
        const animal = farmAnimals.find(a => String(a.id) === animalIdStr);
        const qty = row.quantity || 1; 

        if (animal) {
            const size = animal.size || 1; 
            totalSize += (qty * size);
        } else {
            totalSize += qty;
        }
    }
    return totalSize;
}

/**
 * 🚜 دالة لحساب عدد "قطع الأرض" (Plots) المتاحة للزراعة.
 * بناءً على مستوى اللاعب.
 * ✅ تم التحديث لدعم شبكة 6x6 (36 أرض)
 */
function getLandPlots(client, userId, guildId) {
    const userData = client.getLevel.get(userId, guildId) || {};
    const userLevel = userData.level || 0;

    // ✅ المستوى 50 وفوق: يفتح المزرعة كاملة (36 أرض)
    if (userLevel >= 50) return 36;
    
    // 45-49: 30 أرض (5 صفوف كاملة)
    if (userLevel >= 45) return 30;
    
    // 40-44: 25 أرض
    if (userLevel >= 40) return 25;
    
    // 35-39: 20 أرض
    if (userLevel >= 35) return 20;
    
    // 30-34: 16 أرض
    if (userLevel >= 30) return 16;
    
    // 25-29: 12 أرض (صفين)
    if (userLevel >= 25) return 12;
    
    // 15-24: 9 مربعات
    if (userLevel >= 15) return 9;
    
    // 5-14: 6 مربعات (صف واحد)
    if (userLevel >= 5) return 6;
    
    // 1-4: 3 مربعات (البداية)
    return 3;
}

module.exports = { getPlayerCapacity, getUsedCapacity, getLandPlots };
